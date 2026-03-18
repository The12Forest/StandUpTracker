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
const { recalcUserStats } = require('../utils/recalcStats');
const logger = require('../utils/logger');
const { sendVerificationEmail, resetTransporter, testSmtpConnection } = require('../utils/email');
const { getJwtSecret, getAppConfig, invalidateCache, getEffectiveGoalMinutes } = require('../utils/settings');
const crypto = require('crypto');

const router = express.Router();

const adminRoles = ['admin', 'super_admin'];

router.use(authenticate, softBanCheck, lastActiveTouch);

// recalcUserStats imported from ../utils/recalcStats

// ─── Enhanced Global Stats ───
router.get('/stats', requireRole(...adminRoles), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });
    const verifiedUsers = await User.countDocuments({ emailVerified: true });
    const totalRecords = await TrackingData.countDocuments();
    const memUsage = process.memoryUsage();

    const pipeline = await TrackingData.aggregate([
      { $group: { _id: null, totalSeconds: { $sum: '$seconds' }, totalRecords: { $sum: 1 } } },
    ]);
    const totalTrackingSeconds = pipeline[0]?.totalSeconds || 0;

    // Enhanced analytics
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    const registrationsThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });
    const registrationsThisMonth = await User.countDocuments({ createdAt: { $gte: monthAgo } });

    const today = new Date().toISOString().slice(0, 10);
    const activeToday = await TrackingData.countDocuments({ date: today });

    const avgPipeline = await TrackingData.aggregate([
      { $group: { _id: '$userId', total: { $sum: '$seconds' }, days: { $sum: 1 } } },
      { $group: { _id: null, avgDaily: { $avg: { $divide: ['$total', '$days'] } } } },
    ]);
    const avgDailyMinutesAllUsers = Math.round((avgPipeline[0]?.avgDaily || 0) / 60);

    const topUsers = await User.find({ active: true })
      .sort({ totalStandingSeconds: -1 }).limit(5)
      .select('userId username totalStandingSeconds level');

    const totalLogs = await Log.countDocuments();

    // System RAM stats
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;

    // Users with 2FA
    const users2faTotp = await User.countDocuments({ totpEnabled: true });
    const users2faEmail = await User.countDocuments({ email2faEnabled: true });
    const blockedUsers = await User.countDocuments({ active: false });
    const superAdmins = await User.countDocuments({ role: 'super_admin' });
    const admins = await User.countDocuments({ role: 'admin' });
    const moderators = await User.countDocuments({ role: 'moderator' });

    // Tracking stats
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const activeYesterday = await TrackingData.countDocuments({ date: yesterdayStr });

    res.json({
      server: {
        uptime: process.uptime(),
        memoryRSS: memUsage.rss,
        memoryHeap: memUsage.heapUsed,
        memoryHeapTotal: memUsage.heapTotal,
        totalRAM,
        freeRAM,
        usedRAM,
        cpuLoad: os.loadavg(),
        cpus: os.cpus().length,
        platform: os.platform(),
        nodeVersion: process.version,
        hostname: os.hostname(),
      },
      users: { total: totalUsers, active: activeUsers, verified: verifiedUsers,
               registrationsThisWeek, registrationsThisMonth,
               blocked: blockedUsers,
               totpEnabled: users2faTotp, email2faEnabled: users2faEmail,
               superAdmins, admins, moderators },
      tracking: { totalRecords, totalSeconds: totalTrackingSeconds,
                  avgDailyMinutesAllUsers, activeToday, activeYesterday },
      topUsers,
      logs: { total: totalLogs },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── List users ───
router.get('/users', requireRole(...adminRoles), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);
    const query = {};
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
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
        // Soft-delete: scramble identifiable info
        for (const uid of safeIds) {
          const u = await User.findOne({ userId: uid });
          if (u) {
            u.active = false;
            u.username = `_deleted_${uid.slice(0, 8)}`;
            u.email = `deleted_${uid.slice(0, 8)}@deleted.local`;
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
    const { level, page = 1, limit = 100, search } = req.query;
    const query = {};
    if (level) query.level = level.toUpperCase();
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.message = { $regex: escaped, $options: 'i' };
    }

    const logs = await Log.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Log.countDocuments(query);
    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ─── Audit Logs (super_admin only) ───
router.get('/audit', requireRole('super_admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    const query = {};
    if (action) query.action = action;
    const logs = await AuditLog.find(query).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(parseInt(limit));
    const total = await AuditLog.countDocuments(query);
    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / limit) });
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
    // === USERS ===
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ active: true });
    const inactiveUsers = totalUsers - activeUsers;
    const verifiedEmails = await User.countDocuments({ emailVerified: true });
    const unverifiedEmails = totalUsers - verifiedEmails;

    // New registrations over time (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const registrationsByMonth = await User.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Login frequency: users active in last 24h, 7d, 30d
    const now = new Date();
    const day = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const activeLast24h = await User.countDocuments({ lastActiveAt: { $gte: day } });
    const activeLast7d = await User.countDocuments({ lastActiveAt: { $gte: week } });
    const activeLast30d = await User.countDocuments({ lastActiveAt: { $gte: month } });

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
    const topFriendUsers = await User.find({ userId: { $in: topFriendUserIds } }).select('userId username');
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

    const largestGroups = await Group.find({}).sort({ 'members': -1 }).limit(5).select('groupId name members');
    const largestGroupsList = largestGroups.map(g => ({
      groupId: g.groupId,
      name: g.name,
      memberCount: g.members?.length || 0,
    })).sort((a, b) => b.memberCount - a.memberCount);

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

    if (hardDelete) {
      await TrackingData.deleteMany({ userId: user.userId });
      await user.deleteOne();
    } else {
      user.active = false;
      user.username = `_deleted_${user.userId.slice(0, 8)}`;
      user.email = `deleted_${user.userId.slice(0, 8)}@deleted.local`;
      await user.save();
    }

    await AuditLog.create({
      actorId: req.user.userId, actorRole: req.user.role,
      targetId: user.userId, action: 'admin_delete_user',
      details: { username: user.username, hardDelete: !!hardDelete }, ip: req.ip,
    });

    logger.info(`Admin deleted user ${user.username} (hard=${!!hardDelete})`, { source: 'admin', userId: req.user.userId });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
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
    tracking.forEach(d => {
      trackingMap[d.date] = d.seconds;
      if (d.manualOverride) manualOverrideMap[d.date] = true;
    });

    // Get all overrides in range
    const overrides = await DailyGoalOverride.find({
      userId: req.params.userId,
      date: { $gte: startStr, $lte: endStr },
    });
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.date] = o.goalMinutes; });

    res.json({
      userId: user.userId,
      username: user.username,
      defaultGoalMinutes: effectiveGoal,
      trackingMap,
      manualOverrideMap,
      overrideMap,
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

module.exports = router;
