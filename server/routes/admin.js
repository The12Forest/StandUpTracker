const express = require('express');
const os = require('os');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const { authenticate, requireRole } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const User = require('../models/User');
const Log = require('../models/Log');
const Settings = require('../models/Settings');
const TrackingData = require('../models/TrackingData');
const AuditLog = require('../models/AuditLog');
const Friendship = require('../models/Friendship');
const Group = require('../models/Group');
const DailyGoalOverride = require('../models/DailyGoalOverride');
const OffDay = require('../models/OffDay');
const FriendStreak = require('../models/FriendStreak');
const AiAdviceCache = require('../models/AiAdviceCache');
const { recalcUserStats } = require('../utils/recalcStats');
const logger = require('../utils/logger');
const { sendVerificationEmail, resetTransporter, testSmtpConnection } = require('../utils/email');
const { getJwtSecret, getAppConfig, invalidateCache, getEffectiveGoalMinutes } = require('../utils/settings');
const crypto = require('crypto');

const router = express.Router();

const adminRoles = ['admin', 'super_admin'];

router.use(authenticate, softBanCheck, lastActiveTouch);

// recalcUserStats imported from ../utils/recalcStats

// ─── CPU usage tracking for averaged stats ───
let cpuUsageCache = { current: 0, samples: [], lastMeasured: 0 };
function measureCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
}
let prevCpu = measureCpuUsage();
setInterval(() => {
  const curr = measureCpuUsage();
  const idleDiff = curr.idle - prevCpu.idle;
  const totalDiff = curr.total - prevCpu.total;
  const pct = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
  cpuUsageCache.current = pct;
  cpuUsageCache.samples.push(pct);
  if (cpuUsageCache.samples.length > 30) cpuUsageCache.samples.shift(); // 5min of 10s samples
  prevCpu = curr;
}, 10000);

// ─── Enhanced Global Stats ───
router.get('/stats', requireRole(...adminRoles), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // ── System Health ──
    const memUsage = process.memoryUsage();
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    const cpuPercent = cpuUsageCache.current;
    const cpuAvg5m = cpuUsageCache.samples.length > 0
      ? Math.round(cpuUsageCache.samples.reduce((a, b) => a + b, 0) / cpuUsageCache.samples.length)
      : cpuPercent;

    // Disk usage (app data directory)
    let diskUsed = 0, diskTotal = 0;
    try {
      const { execSync } = require('child_process');
      if (os.platform() === 'win32') {
        const drive = process.cwd().slice(0, 2);
        const out = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /format:csv`, { encoding: 'utf8' });
        const parts = out.trim().split('\n').pop().split(',');
        const freeSpace = parseInt(parts[1]) || 0;
        const totalSpace = parseInt(parts[2]) || 0;
        diskTotal = totalSpace;
        diskUsed = totalSpace - freeSpace;
      } else {
        const out = execSync(`df -B1 ${process.cwd()} | tail -1`, { encoding: 'utf8' });
        const parts = out.trim().split(/\s+/);
        diskTotal = parseInt(parts[1]) || 0;
        diskUsed = parseInt(parts[2]) || 0;
      }
    } catch { /* disk stats unavailable */ }

    // WebSocket connections
    const io = req.app.get('io');
    const wsConnections = io ? io.engine.clientsCount : 0;

    // Unique online users
    let onlineUserIds = new Set();
    if (io) {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if (s.user?.userId) onlineUserIds.add(s.user.userId);
      }
    }

    // DB size
    let dbSizeBytes = 0;
    try {
      const mongoose = require('mongoose');
      const dbStats = await mongoose.connection.db.stats();
      dbSizeBytes = dbStats.dataSize + (dbStats.indexSize || 0);
    } catch { /* db stats unavailable */ }

    // ── Application Activity ── (exclude deleted users' tracking data)
    const deletedUserIds = (await User.find({ deletedAt: { $ne: null } }).select('userId')).map(u => u.userId);
    const trackingNotDeleted = deletedUserIds.length > 0 ? { userId: { $nin: deletedUserIds } } : {};

    const trackingAgg = await TrackingData.aggregate([
      ...(deletedUserIds.length ? [{ $match: trackingNotDeleted }] : []),
      { $group: { _id: null, totalSeconds: { $sum: '$seconds' }, totalRecords: { $sum: 1 } } },
    ]);
    const totalTrackingSeconds = trackingAgg[0]?.totalSeconds || 0;
    const totalRecords = trackingAgg[0]?.totalRecords || 0;

    // Total sessions (sum of sessions array lengths)
    const sessionCountAgg = await TrackingData.aggregate([
      ...(deletedUserIds.length ? [{ $match: trackingNotDeleted }] : []),
      { $project: { sessionCount: { $size: { $ifNull: ['$sessions', []] } } } },
      { $group: { _id: null, total: { $sum: '$sessionCount' } } },
    ]);
    const totalSessions = sessionCountAgg[0]?.total || totalRecords;

    const avgPipeline = await TrackingData.aggregate([
      ...(deletedUserIds.length ? [{ $match: trackingNotDeleted }] : []),
      { $group: { _id: '$userId', total: { $sum: '$seconds' }, days: { $sum: 1 } } },
      { $group: { _id: null, avgDaily: { $avg: { $divide: ['$total', '$days'] } } } },
    ]);
    const avgDailyMinutesAllUsers = Math.round((avgPipeline[0]?.avgDaily || 0) / 60);

    const activeToday = await TrackingData.countDocuments({ date: today, ...trackingNotDeleted });
    const activeYesterday = await TrackingData.countDocuments({ date: yesterdayStr, ...trackingNotDeleted });

    // Sessions started/completed today
    const todayRecords = await TrackingData.find({ date: today, ...trackingNotDeleted }).select('sessions');
    let sessionsStartedToday = 0, sessionsCompletedToday = 0;
    for (const rec of todayRecords) {
      const sess = rec.sessions || [];
      sessionsStartedToday += sess.length;
      sessionsCompletedToday += sess.filter(s => s.end).length;
    }

    // AI advice stats
    const totalAiRequests = await AiAdviceCache.countDocuments();
    const todayStart = new Date(today + 'T00:00:00.000Z');
    const aiRequestsToday = await AiAdviceCache.countDocuments({ generatedAt: { $gte: todayStart } });

    // ── User Engagement ── (exclude soft-deleted users)
    const notDeleted = { deletedAt: null };
    const totalUsers = await User.countDocuments(notDeleted);
    const activeUsers = await User.countDocuments({ active: true, ...notDeleted });
    const verifiedUsers = await User.countDocuments({ emailVerified: true, ...notDeleted });
    const registrationsThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo }, ...notDeleted });
    const registrationsThisMonth = await User.countDocuments({ createdAt: { $gte: monthAgo }, ...notDeleted });
    const usersActiveThisWeek = await TrackingData.distinct('userId', { date: { $gte: new Date(weekAgo).toISOString().slice(0, 10) } });
    const users2faTotp = await User.countDocuments({ totpEnabled: true, ...notDeleted });
    const users2faEmail = await User.countDocuments({ email2faEnabled: true, ...notDeleted });
    const blockedUsers = await User.countDocuments({ active: false, ...notDeleted });
    const superAdmins = await User.countDocuments({ role: 'super_admin', ...notDeleted });
    const admins = await User.countDocuments({ role: 'admin', ...notDeleted });
    const moderators = await User.countDocuments({ role: 'moderator', ...notDeleted });

    // Registration sparkline (last 7 days)
    const regSparkline = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      const nextD = new Date(d); nextD.setDate(nextD.getDate() + 1);
      const count = await User.countDocuments({ createdAt: { $gte: new Date(dayStr + 'T00:00:00Z'), $lt: new Date(nextD.toISOString().slice(0, 10) + 'T00:00:00Z') }, ...notDeleted });
      regSparkline.push({ date: dayStr, count });
    }

    // ── Streak Statistics ── (exclude soft-deleted users)
    const activePersonalStreaks = await User.countDocuments({ currentStreak: { $gt: 0 }, ...notDeleted });
    const longestStreakUser = await User.findOne({ bestStreak: { $gt: 0 }, ...notDeleted }).sort({ bestStreak: -1 }).select('username bestStreak');
    const activeFriendStreaks = await FriendStreak.countDocuments({ currentStreak: { $gt: 0 } });
    const activeGroupStreaks = await Group.countDocuments({ currentStreak: { $gt: 0 } });
    const avgStreakPipeline = await User.aggregate([
      { $match: { currentStreak: { $gt: 0 }, ...notDeleted } },
      { $group: { _id: null, avg: { $avg: '$currentStreak' } } },
    ]);
    const avgStreakLength = Math.round((avgStreakPipeline[0]?.avg || 0) * 10) / 10;

    const topUsers = await User.find({ active: true, ...notDeleted })
      .sort({ totalStandingSeconds: -1 }).limit(5)
      .select('userId username totalStandingSeconds level');
    const totalLogs = await Log.countDocuments();

    res.json({
      server: {
        uptime: process.uptime(),
        memoryRSS: memUsage.rss,
        memoryHeap: memUsage.heapUsed,
        memoryHeapTotal: memUsage.heapTotal,
        totalRAM, freeRAM, usedRAM,
        cpuPercent, cpuAvg5m,
        diskUsed, diskTotal,
        wsConnections,
        onlineUsers: onlineUserIds.size,
        dbSizeBytes,
        cpus: os.cpus().length,
        platform: os.platform(),
        nodeVersion: process.version,
        hostname: os.hostname(),
      },
      users: {
        total: totalUsers, active: activeUsers, verified: verifiedUsers,
        registrationsThisWeek, registrationsThisMonth,
        activeThisWeek: usersActiveThisWeek.length,
        blocked: blockedUsers,
        totpEnabled: users2faTotp, email2faEnabled: users2faEmail,
        twoFaTotal: users2faTotp + users2faEmail,
        superAdmins, admins, moderators,
        regSparkline,
      },
      tracking: {
        totalRecords, totalSeconds: totalTrackingSeconds, totalSessions,
        avgDailyMinutesAllUsers,
        activeToday, activeYesterday,
        sessionsStartedToday, sessionsCompletedToday,
        aiRequestsTotal: totalAiRequests, aiRequestsToday,
      },
      streaks: {
        activePersonal: activePersonalStreaks,
        longestPersonal: longestStreakUser ? { username: longestStreakUser.username, days: longestStreakUser.bestStreak } : null,
        activeFriend: activeFriendStreaks,
        activeGroup: activeGroupStreaks,
        avgLength: avgStreakLength,
      },
      topUsers,
      logs: { total: totalLogs },
    });
  } catch (err) {
    logger.error('Admin stats error', { source: 'admin', meta: { error: err.message } });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── List users ───
router.get('/users', requireRole(...adminRoles), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, deleted } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);
    const query = {};
    // Filter by deleted status
    if (deleted === 'true') {
      query.deletedAt = { $ne: null };
    } else {
      query.deletedAt = null;
    }
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { originalUsername: { $regex: escaped, $options: 'i' } },
        { originalEmail: { $regex: escaped, $options: 'i' } },
      ];
    }
    const users = await User.find(query)
      .select('-passwordHash -totpSecret -totpRecoveryCodes -email2faCode -emailVerifyToken -emailVerifyExpires -email2faExpires -pendingEmailToken -pendingEmailExpires')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * safeLimit)
      .limit(safeLimit);
    const total = await User.countDocuments(query);
    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Update user role/status ───
router.put('/users/:userId', requireRole('super_admin'), async (req, res) => {
  try {
    const { role, active, blockedUntil } = req.body;
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot modify your own account here' });
    }

    const before = { role: user.role, active: user.active };
    if (role && ['user', 'moderator', 'admin'].includes(role)) {
      user.role = role;
    }
    if (typeof active === 'boolean') {
      user.active = active;
      if (!active) {
        // Force-disconnect existing socket sessions immediately
        const io = req.app.get('io');
        if (io) io.in(`user:${user.userId}`).disconnectSockets(true);
      }
    }
    if (blockedUntil !== undefined) {
      user.blockedUntil = blockedUntil ? new Date(blockedUntil) : null;
    }
    await user.save();

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: user.userId,
      action: 'role_change',
      details: { before, after: { role: user.role, active: user.active } },
      ip: req.ip,
    });

    logger.info(`User updated by admin: ${user.username} -> role=${user.role}, active=${user.active}`, {
      source: 'admin', userId: req.user.userId
    });
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── Bulk user actions ───
router.post('/users/bulk', requireRole('super_admin'), async (req, res) => {
  try {
    const { userIds, action, params = {} } = req.body;
    if (!userIds || !Array.isArray(userIds) || !action) {
      return res.status(400).json({ error: 'userIds array and action required' });
    }

    // Prevent self-targeting
    const safeIds = userIds.filter(id => id !== req.user.userId);
    let affected = 0;

    switch (action) {
      case 'deactivate':
        await User.updateMany({ userId: { $in: safeIds } }, { active: false });
        affected = safeIds.length;
        // Force-disconnect all deactivated users' sockets
        {
          const io = req.app.get('io');
          if (io) for (const uid of safeIds) io.in(`user:${uid}`).disconnectSockets(true);
        }
        break;
      case 'activate':
        await User.updateMany({ userId: { $in: safeIds } }, { active: true });
        affected = safeIds.length;
        break;
      case 'setRole':
        if (!params.role || !['user', 'moderator', 'admin'].includes(params.role)) {
          return res.status(400).json({ error: 'Valid role required' });
        }
        await User.updateMany({ userId: { $in: safeIds } }, { role: params.role });
        affected = safeIds.length;
        break;
      case 'delete':
        for (const uid of safeIds) {
          const u = await User.findOne({ userId: uid });
          if (u && u.role !== 'super_admin') {
            const origUsername = u.username;
            const origEmail = u.email;
            // Build unique _deleted suffix
            let suffix = '_deleted';
            let candidate = `${u.username}${suffix}`;
            let counter = 0;
            while (await User.findOne({ username: candidate, userId: { $ne: u.userId } })) {
              counter++;
              candidate = `${u.username}_deleted_${counter}`;
            }
            const emailLocal = u.email.split('@')[0];
            const emailDomain = u.email.split('@').slice(1).join('@');
            let emailCandidate = `${emailLocal}_deleted@${emailDomain}`;
            let emailCounter = 0;
            while (await User.findOne({ email: emailCandidate, userId: { $ne: u.userId } })) {
              emailCounter++;
              emailCandidate = `${emailLocal}_deleted_${emailCounter}@${emailDomain}`;
            }
            u.active = false;
            u.originalUsername = origUsername;
            u.originalEmail = origEmail;
            u.deletedAt = new Date();
            u.username = candidate;
            u.email = emailCandidate;
            await u.save();
            if (params.confirmHardDelete) {
              await TrackingData.deleteMany({ userId: uid });
            }
            // Force-disconnect the deleted user's sockets
            const io = req.app.get('io');
            if (io) io.in(`user:${uid}`).disconnectSockets(true);
            affected++;
          }
        }
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // Audit log
    for (const uid of safeIds) {
      await AuditLog.create({
        actorId: req.user.userId, actorRole: req.user.role,
        targetId: uid, action: `bulk_${action}`,
        details: { params }, ip: req.ip,
      });
    }

    res.json({ message: `${action} applied to ${affected} users` });
  } catch (err) {
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

// ─── Impersonation ───
// IMPORTANT: /impersonate/end MUST be registered before /impersonate/:userId so Express
// does not capture the literal string "end" as a userId param and block with requireRole.
router.post('/impersonate/end', authenticate, async (req, res) => {
  try {
    if (!req.impersonator) return res.status(400).json({ error: 'Not currently impersonating' });

    // Clear impersonation on target
    req.user.impersonatedBy = undefined;
    await req.user.save();

    await AuditLog.create({
      actorId: req.impersonator.userId, actorRole: req.impersonator.role,
      targetId: req.user.userId, action: 'impersonate_end',
      details: { targetUsername: req.user.username }, ip: req.ip,
    });

    const io = req.app.get('io');
    io.to('admins').emit('IMPERSONATE_ALERT', {
      admin: req.impersonator.userId, target: req.user.username, action: 'end',
    });

    // Clear the shadow JWT cookie so the admin's cookie (from login) takes effect again
    res.clearCookie('sut_session', { path: '/' });

    res.json({ message: 'Impersonation ended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
});

router.post('/impersonate/:userId', requireRole('super_admin'), async (req, res) => {
  try {
    const enabled = await Settings.get('impersonationEnabled');
    if (enabled === false) return res.status(403).json({ error: 'Impersonation is disabled' });

    const target = await User.findOne({ userId: req.params.userId, active: true });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot impersonate another super_admin' });

    // Create Shadow JWT
    const secret = await getJwtSecret();
    const shadowToken = jwt.sign(
      { userId: target.userId, role: target.role, imp: req.user.userId, impRole: req.user.role },
      secret,
      { expiresIn: '30m' }
    );

    target.impersonatedBy = req.user.userId;
    await target.save();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: target.userId, action: 'impersonate_start',
      details: { targetUsername: target.username }, ip: req.ip,
    });

    // Notify admins
    const io = req.app.get('io');
    io.to('admins').emit('IMPERSONATE_ALERT', {
      admin: req.user.username, target: target.username, action: 'start',
    });

    logger.info(`Impersonation started: ${req.user.username} -> ${target.username}`, {
      source: 'admin', userId: req.user.userId
    });

    const { sessionSecure } = await getAppConfig();
    res.cookie('sut_session', shadowToken, {
      httpOnly: true,
      secure: sessionSecure,
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000,
      path: '/',
    });

    res.json({ token: shadowToken, user: {
      userId: target.userId, username: target.username, email: target.email,
      role: target.role, theme: target.theme, dailyGoalMinutes: target.dailyGoalMinutes,
      emailVerified: target.emailVerified,
    }});
  } catch (err) {
    res.status(500).json({ error: 'Impersonation failed' });
  }
});

// ─── Admin Tracking CRUD ───
router.get('/tracking/:userId', requireRole(...adminRoles), async (req, res) => {
  try {
    const data = await TrackingData.find({ userId: req.params.userId }).sort({ date: -1 }).limit(365);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

router.put('/tracking/:userId/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    const { seconds, sessions } = req.body;
    const before = await TrackingData.findOne({ userId: req.params.userId, date: req.params.date });

    const update = {};
    if (seconds != null) {
      update.seconds = seconds;
      update.manualOverride = true;
      // Preserve original timer value on first admin override
      if (before && !before.manualOverride && before.originalSeconds == null) {
        update.originalSeconds = before.seconds;
      }
    }
    if (sessions) update.sessions = sessions;

    await TrackingData.findOneAndUpdate(
      { userId: req.params.userId, date: req.params.date },
      { $set: update },
      { upsert: true }
    );

    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'data_edit',
      details: { date: req.params.date, before: before?.seconds, after: seconds },
      ip: req.ip,
    });

    res.json({ message: 'Tracking data updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tracking data' });
  }
});

router.delete('/tracking/:userId/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    const before = await TrackingData.findOne({ userId: req.params.userId, date: req.params.date });
    if (!before) return res.status(404).json({ error: 'Record not found' });

    await before.deleteOne();
    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'data_delete',
      details: { date: req.params.date, seconds: before.seconds },
      ip: req.ip,
    });

    res.json({ message: 'Tracking record deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tracking data' });
  }
});

// Reset manual override to original timer value
router.delete('/tracking/:userId/:date/override', requireRole(...adminRoles), async (req, res) => {
  try {
    const record = await TrackingData.findOne({ userId: req.params.userId, date: req.params.date });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (!record.manualOverride) return res.status(400).json({ error: 'No manual override to reset' });

    const beforeSeconds = record.seconds;
    record.seconds = record.originalSeconds != null ? record.originalSeconds : record.seconds;
    record.manualOverride = false;
    record.originalSeconds = null;
    await record.save();

    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'data_override_reset',
      details: { date: req.params.date, before: beforeSeconds, after: record.seconds },
      ip: req.ip,
    });

    res.json({ message: 'Override reset', seconds: record.seconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset override' });
  }
});

// ─── Logs ───
router.get('/logs', requireRole(...adminRoles), async (req, res) => {
  try {
    const { level, search } = req.query;
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(parseInt(req.query.limit) || 100, 500);
    const query = {};
    if (level) query.level = level.toUpperCase();
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.message = { $regex: escaped, $options: 'i' };
    }

    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    const total = await Log.countDocuments(query);
    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ─── Audit Logs (super_admin only) ───
router.get('/audit', requireRole('super_admin'), async (req, res) => {
  try {
    const { action } = req.query;
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(parseInt(req.query.limit) || 50, 200);
    const query = {};
    if (action) query.action = action;
    const logs = await AuditLog.find(query).sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum).limit(limitNum);
    const total = await AuditLog.countDocuments(query);
    res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ─── Settings / Config ───
router.get('/settings', requireRole(...adminRoles), async (req, res) => {
  try {
    const settings = await Settings.getAll();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', requireRole('super_admin'), async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await Settings.set(key, value);
    }

    // Invalidate cached settings and reset SMTP transporter
    invalidateCache();
    resetTransporter();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      action: 'setting_change',
      details: { updates }, ip: req.ip,
    });

    // If enforcement settings changed, notify all connected users to refresh
    const enforcementKeys = ['enforceDailyGoal', 'masterDailyGoalMinutes', 'enforce2fa'];
    const hasEnforcementChange = Object.keys(updates).some(k => enforcementKeys.includes(k));
    if (hasEnforcementChange) {
      const io = req.app.get('io');
      if (io) {
        io.to('authenticated').emit('SETTINGS_CHANGED', { keys: Object.keys(updates) });
      }
    }

    logger.info('Settings updated by admin', { source: 'admin', userId: req.user.userId });
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── WebSocket connection count ───
router.get('/connections', requireRole(...adminRoles), async (req, res) => {
  const io = req.app.get('io');
  const sockets = await io.fetchSockets();
  res.json({ connections: sockets.length });
});

// ─── Extended Statistics: Users, Friends, Groups ───
router.get('/stats/extended', requireRole(...adminRoles), async (req, res) => {
  try {
    // === USERS === (exclude soft-deleted users)
    const notDeleted = { deletedAt: null };
    const totalUsers = await User.countDocuments(notDeleted);
    const activeUsers = await User.countDocuments({ active: true, ...notDeleted });
    const inactiveUsers = totalUsers - activeUsers;
    const verifiedEmails = await User.countDocuments({ emailVerified: true, ...notDeleted });
    const unverifiedEmails = totalUsers - verifiedEmails;

    // New registrations over time (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const registrationsByMonth = await User.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo }, ...notDeleted } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Login frequency: users active in last 24h, 7d, 30d
    const now = new Date();
    const day = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const activeLast24h = await User.countDocuments({ lastActiveAt: { $gte: day }, ...notDeleted });
    const activeLast7d = await User.countDocuments({ lastActiveAt: { $gte: week }, ...notDeleted });
    const activeLast30d = await User.countDocuments({ lastActiveAt: { $gte: month }, ...notDeleted });

    // === FRIENDS ===
    const totalFriendships = await Friendship.countDocuments({ status: 'accepted' });
    const pendingRequests = await Friendship.countDocuments({ status: 'pending' });
    const totalRequests = await Friendship.countDocuments({ status: { $in: ['pending', 'accepted'] } });
    const acceptanceRate = totalRequests > 0 ? Math.round((totalFriendships / totalRequests) * 100) : 0;

    // Average friends per user
    const friendCounts = await Friendship.aggregate([
      { $match: { status: 'accepted' } },
      { $facet: {
          requesters: [{ $group: { _id: '$requester', count: { $sum: 1 } } }],
          recipients: [{ $group: { _id: '$recipient', count: { $sum: 1 } } }],
      }},
    ]);
    const friendMap = {};
    (friendCounts[0]?.requesters || []).forEach(r => { friendMap[r._id] = (friendMap[r._id] || 0) + r.count; });
    (friendCounts[0]?.recipients || []).forEach(r => { friendMap[r._id] = (friendMap[r._id] || 0) + r.count; });
    const friendValues = Object.values(friendMap);
    const avgFriendsPerUser = friendValues.length > 0 ? (friendValues.reduce((a, b) => a + b, 0) / friendValues.length).toFixed(1) : 0;

    // Top users by friend count
    const topByFriends = Object.entries(friendMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topFriendUserIds = topByFriends.map(([uid]) => uid);
    const topFriendUsers = await User.find({ userId: { $in: topFriendUserIds }, ...notDeleted }).select('userId username');
    const topFriendUserMap = {};
    topFriendUsers.forEach(u => { topFriendUserMap[u.userId] = u.username; });
    const topUsersByFriendCount = topByFriends.map(([uid, count]) => ({
      userId: uid,
      username: topFriendUserMap[uid] || uid.slice(0, 8),
      friendCount: count,
    }));

    // === GROUPS ===
    const totalGroups = await Group.countDocuments();
    const allGroups = await Group.find({}).select('members createdAt');
    const groupSizes = allGroups.map(g => g.members?.length || 0);
    const avgGroupSize = groupSizes.length > 0 ? (groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length).toFixed(1) : 0;

    const largestGroupsAgg = await Group.aggregate([
      { $project: { groupId: 1, name: 1, members: 1, memberCount: { $size: { $ifNull: ['$members', []] } } } },
      { $sort: { memberCount: -1 } },
      { $limit: 5 },
    ]);
    const largestGroupsList = largestGroupsAgg.map(g => ({
      groupId: g.groupId,
      name: g.name,
      memberCount: g.memberCount,
    }));

    // Active groups: at least one member tracked in last 7 days
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekDate = weekAgo.toISOString().slice(0, 10);
    const recentTrackers = await TrackingData.distinct('userId', { date: { $gte: weekDate } });
    const recentTrackerSet = new Set(recentTrackers);
    let activeGroupCount = 0;
    allGroups.forEach(g => {
      const hasActive = g.members?.some(m => recentTrackerSet.has(m.userId));
      if (hasActive) activeGroupCount++;
    });
    const inactiveGroupCount = totalGroups - activeGroupCount;

    // Group creation over time (last 12 months)
    const groupsByMonth = await Group.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        verifiedEmails,
        unverifiedEmails,
        registrationsByMonth,
        loginFrequency: { last24h: activeLast24h, last7d: activeLast7d, last30d: activeLast30d },
      },
      friends: {
        totalFriendships,
        avgFriendsPerUser: parseFloat(avgFriendsPerUser),
        topUsersByFriendCount,
        pendingRequests,
        acceptanceRate,
      },
      groups: {
        total: totalGroups,
        avgGroupSize: parseFloat(avgGroupSize),
        largestGroups: largestGroupsList,
        active: activeGroupCount,
        inactive: inactiveGroupCount,
        groupsByMonth,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch extended stats' });
  }
});

// ─── Admin: Verify user email ───
router.put('/users/:userId/verify-email', requireRole('super_admin'), async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_verify_email',
      details: { email: user.email }, ip: req.ip,
    });

    logger.info(`Admin verified email for ${user.username}`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'Email verified' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// ─── Admin: Force user to re-verify email ───
router.post('/users/:userId/force-reverify', requireRole('super_admin'), async (req, res) => {
  try {
    const allowed = await Settings.get('allowForceReverify');
    if (allowed === false) return res.status(403).json({ error: 'Force re-verification is disabled in settings' });

    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot force re-verify a super admin' });

    // Reset verified status and generate new token
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerified = false;
    user.emailVerifyToken = token;
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // Send verification email
    sendVerificationEmail(user.email, token).catch(err => {
      logger.error('Failed to send re-verification email', {
        source: 'admin', userId: req.user.userId,
        meta: { targetEmail: user.email, error: err.message },
      });
    });

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'force_reverify',
      details: { email: user.email }, ip: req.ip,
    });

    logger.info(`Admin forced re-verification for ${user.username}`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'User must re-verify their email. Verification email sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to force re-verification' });
  }
});

// ─── Admin: Set new password for user ───
router.put('/users/:userId/password', requireRole('super_admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.passwordHash = await argon2.hash(newPassword);
    await user.save();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_set_password',
      details: { username: user.username }, ip: req.ip,
    });

    logger.info(`Admin reset password for ${user.username}`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set password' });
  }
});

// ─── Admin: Delete user ───
router.delete('/users/:userId', requireRole('super_admin'), async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super_admin' });
    if (user.userId === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account' });

    const { hardDelete } = req.body || {};

    // Force-disconnect the user's active socket sessions before deletion
    const io = req.app.get('io');
    if (io) io.in(`user:${user.userId}`).disconnectSockets(true);

    const originalUsername = user.username;
    const originalEmail = user.email;

    if (hardDelete) {
      await TrackingData.deleteMany({ userId: user.userId });
      await DailyGoalOverride.deleteMany({ userId: user.userId });
      await OffDay.deleteMany({ userId: user.userId });
      await Friendship.deleteMany({ $or: [{ requesterId: user.userId }, { receiverId: user.userId }] });
      await FriendStreak.deleteMany({ $or: [{ userId1: user.userId }, { userId2: user.userId }] });
      await AiAdviceCache.deleteMany({ userId: user.userId });
      const Notification = require('../models/Notification');
      await Notification.deleteMany({ userId: user.userId });
      await user.deleteOne();
    } else {
      // Build unique _deleted suffix
      let suffix = '_deleted';
      let candidate = `${user.username}${suffix}`;
      let counter = 0;
      while (await User.findOne({ username: candidate, userId: { $ne: user.userId } })) {
        counter++;
        candidate = `${user.username}_deleted_${counter}`;
      }
      const emailLocal = user.email.split('@')[0];
      const emailDomain = user.email.split('@').slice(1).join('@');
      let emailSuffix = '_deleted';
      let emailCandidate = `${emailLocal}${emailSuffix}@${emailDomain}`;
      let emailCounter = 0;
      while (await User.findOne({ email: emailCandidate, userId: { $ne: user.userId } })) {
        emailCounter++;
        emailCandidate = `${emailLocal}_deleted_${emailCounter}@${emailDomain}`;
      }

      user.active = false;
      user.originalUsername = originalUsername;
      user.originalEmail = originalEmail;
      user.deletedAt = new Date();
      user.username = candidate;
      user.email = emailCandidate;
      await user.save();
    }

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_delete_user',
      details: { originalUsername, originalEmail, hardDelete: !!hardDelete }, ip: req.ip,
    });

    logger.info(`Admin deleted user ${user.username} (hard=${!!hardDelete})`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── Admin: Permanently delete a soft-deleted user ───
router.delete('/users/:userId/permanent', requireRole('super_admin'), async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(400).json({ error: 'User is not soft-deleted. Soft-delete first.' });

    const originalUsername = user.originalUsername || user.username;

    // Remove all associated data
    await TrackingData.deleteMany({ userId: user.userId });
    await DailyGoalOverride.deleteMany({ userId: user.userId });
    await OffDay.deleteMany({ userId: user.userId });
    await Friendship.deleteMany({ $or: [{ requesterId: user.userId }, { receiverId: user.userId }] });
    await FriendStreak.deleteMany({ $or: [{ userId1: user.userId }, { userId2: user.userId }] });
    await AiAdviceCache.deleteMany({ userId: user.userId });
    const Notification = require('../models/Notification');
    await Notification.deleteMany({ userId: user.userId });
    // Remove from groups
    await Group.updateMany({ members: user.userId }, { $pull: { members: user.userId } });
    await user.deleteOne();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_permanent_delete',
      details: { originalUsername }, ip: req.ip,
    });

    logger.info(`Admin permanently deleted user ${originalUsername}`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'User permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete user' });
  }
});

// ─── Admin: Block/Unblock user ───
router.put('/users/:userId/block', requireRole('super_admin'), async (req, res) => {
  try {
    const { blocked, until } = req.body;
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot block super_admin' });

    if (blocked) {
      user.active = false;
      if (until) user.blockedUntil = new Date(until);
      // Force-disconnect the blocked user's active socket sessions
      const io = req.app.get('io');
      if (io) io.in(`user:${user.userId}`).disconnectSockets(true);
    } else {
      user.active = true;
      user.blockedUntil = null;
    }
    await user.save();

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_block_user',
      details: { blocked, until, username: user.username }, ip: req.ip,
    });

    res.json({ message: blocked ? 'User blocked' : 'User unblocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update block status' });
  }
});

// ─── Admin: Per-user per-day time editor data ───
router.get('/users/:userId/daily-times', requireRole(...adminRoles), async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const effectiveGoal = await getEffectiveGoalMinutes(user);

    // Get tracking data for past 90 days + next 30 days range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    const tracking = await TrackingData.find({
      userId: req.params.userId,
      date: { $gte: startStr, $lte: endStr },
    });
    const trackingMap = {};
    const manualOverrideMap = {};
    const reportClearedMap = {};
    tracking.forEach(d => {
      trackingMap[d.date] = d.seconds;
      if (d.manualOverride) manualOverrideMap[d.date] = true;
      if (d.clearedByReports) {
        reportClearedMap[d.date] = {
          preReportSeconds: d.preReportSeconds,
          reportCount: d.reportCount,
          clearedAt: d.reportClearedAt,
          restored: d.reportRestored,
          restoredBy: d.reportRestoredBy,
          restoredAt: d.reportRestoredAt,
        };
      }
    });

    // Get all overrides in range
    const overrides = await DailyGoalOverride.find({
      userId: req.params.userId,
      date: { $gte: startStr, $lte: endStr },
    });
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.date] = o.goalMinutes; });

    // Get off days in range
    const offDays = await OffDay.find({
      userId: req.params.userId,
      date: { $gte: startStr, $lte: endStr },
    });
    const offDayMap = {};
    offDays.forEach(o => { offDayMap[o.date] = true; });

    res.json({
      userId: user.userId,
      username: user.username,
      defaultGoalMinutes: effectiveGoal,
      trackingMap,
      manualOverrideMap,
      reportClearedMap,
      overrideMap,
      offDayMap,
      startDate: startStr,
      endDate: endStr,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily times' });
  }
});

// ─── Admin: Set per-day goal override ───
router.put('/users/:userId/daily-goal/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    const { goalMinutes } = req.body;
    if (!goalMinutes || goalMinutes < 1 || goalMinutes > 1440) {
      return res.status(400).json({ error: 'goalMinutes must be between 1 and 1440' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD required)' });
    }

    await DailyGoalOverride.findOneAndUpdate(
      { userId: req.params.userId, date: req.params.date },
      { $set: { goalMinutes } },
      { upsert: true }
    );

    // Recalc user stats since goal override may affect streaks
    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'daily_goal_override',
      details: { date: req.params.date, goalMinutes },
      ip: req.ip,
    });

    res.json({ message: 'Daily goal override saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save daily goal override' });
  }
});

// ─── Admin: Clear per-day goal override ───
router.delete('/users/:userId/daily-goal/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const deleted = await DailyGoalOverride.findOneAndDelete({
      userId: req.params.userId,
      date: req.params.date,
    });
    if (!deleted) return res.status(404).json({ error: 'No override found for this date' });

    // Recalc user stats since removing override may affect streaks
    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'daily_goal_override_clear',
      details: { date: req.params.date },
      ip: req.ip,
    });

    res.json({ message: 'Override cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear override' });
  }
});

// ─── Admin: Set/unset off day ───
router.put('/users/:userId/off-day/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD required)' });
    }

    await OffDay.findOneAndUpdate(
      { userId: req.params.userId, date: req.params.date },
      { $setOnInsert: { userId: req.params.userId, date: req.params.date } },
      { upsert: true }
    );

    // Recalc stats since off day affects streaks
    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'off_day_set',
      details: { date: req.params.date },
      ip: req.ip,
    });

    res.json({ message: 'Off day set' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set off day' });
  }
});

router.delete('/users/:userId/off-day/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const deleted = await OffDay.findOneAndDelete({
      userId: req.params.userId,
      date: req.params.date,
    });
    if (!deleted) return res.status(404).json({ error: 'No off day found for this date' });

    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.impersonator?.userId || req.user.userId,
      actorRole: req.impersonator?.role || req.user.role,
      targetId: req.params.userId, action: 'off_day_clear',
      details: { date: req.params.date },
      ip: req.ip,
    });

    res.json({ message: 'Off day cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear off day' });
  }
});

// ─── Admin: Restore report-cleared daily progress ───
router.post('/users/:userId/restore-report/:date', requireRole(...adminRoles), async (req, res) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const tracking = await TrackingData.findOne({
      userId: req.params.userId,
      date: req.params.date,
    });
    if (!tracking) return res.status(404).json({ error: 'No tracking data found for this date' });
    if (!tracking.clearedByReports) return res.status(400).json({ error: 'This day was not cleared by reports' });
    if (tracking.reportRestored) return res.status(400).json({ error: 'This day has already been restored' });

    // Restore original time
    tracking.seconds = tracking.preReportSeconds || 0;
    tracking.reportRestored = true;
    tracking.reportRestoredBy = req.user.userId;
    tracking.reportRestoredAt = new Date();
    await tracking.save();

    await recalcUserStats(req.params.userId);

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: req.params.userId, action: 'report_restore',
      details: { date: req.params.date, restoredSeconds: tracking.seconds },
      ip: req.ip,
    });

    logger.info(`Admin restored report-cleared progress for ${req.params.userId} on ${req.params.date}`, { source: 'admin' });
    res.json({ message: 'Daily progress restored', seconds: tracking.seconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore progress' });
  }
});

// ─── VAPID Key Generation ───
router.post('/push/generate-vapid', requireRole('super_admin'), async (req, res) => {
  try {
    const webpush = require('web-push');
    const vapidKeys = webpush.generateVAPIDKeys();

    await Settings.set('vapidPublicKey', vapidKeys.publicKey);
    await Settings.set('vapidPrivateKey', vapidKeys.privateKey);
    invalidateCache();

    // Reset cached VAPID config so new keys are picked up
    const { resetVapidConfig } = require('../utils/pushSender');
    resetVapidConfig();

    // Remove all existing push subscriptions since old keys are now invalid
    const PushSubscription = require('../models/PushSubscription');
    const deleted = await PushSubscription.deleteMany({});

    // Disable push for all users since their subscriptions are invalidated
    await User.updateMany({ pushEnabled: true }, { $set: { pushEnabled: false } });

    await AuditLog.create({
      action: 'vapid_keys_regenerated',
      actorId: req.user.userId,
      actorRole: req.user.role,
      details: { subscriptionsRemoved: deleted.deletedCount },
    });

    res.json({
      publicKey: vapidKeys.publicKey,
      message: `New VAPID keys generated. ${deleted.deletedCount} existing subscription(s) removed.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate VAPID keys' });
  }
});

module.exports = router;
