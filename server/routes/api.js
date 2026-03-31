const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { currentDayGuard, softBanCheck, lastActiveTouch } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const Notification = require('../models/Notification');
const User = require('../models/User');
const OffDay = require('../models/OffDay');
const { syncFriendStreaks, syncGroupStreaks } = require('../utils/streaks');
const { getEffectiveGoalMinutes, getSetting, getMinActivityThresholdSeconds } = require('../utils/settings');
const { recalcUserStats } = require('../utils/recalcStats');
const { sendPushNotification } = require('../utils/pushSender');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');

const router = express.Router();

// Apply soft-ban and last-active to all authenticated routes
router.use(authenticate, softBanCheck, lastActiveTouch);

// ─── Timer state ───
router.get('/timer/state', async (req, res) => {
  const u = await User.findOne({ userId: req.user.userId }).select('timerRunning timerStartedAt');
  res.json({
    running: !!u.timerRunning,
    startedAt: u.timerStartedAt ? u.timerStartedAt.getTime() : null,
    serverTime: Date.now(),
  });
});

router.post('/timer/start', requireVerified, async (req, res) => {
  const now = new Date();
  // Atomically start the timer only if it's not already running
  const u = await User.findOneAndUpdate(
    { userId: req.user.userId, timerRunning: { $ne: true } },
    { $set: { timerRunning: true, timerStartedAt: now } },
    { new: true }
  );
  if (!u) return res.status(409).json({ error: 'Timer already running' });

  // Broadcast to all user devices
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.user.userId}`).emit('TIMER_SYNC', {
      running: true,
      startedAt: now.getTime(),
      serverTime: Date.now(),
    });
  }

  res.json({ running: true, startedAt: now.getTime(), serverTime: Date.now() });
});

router.post('/timer/stop', requireVerified, currentDayGuard, async (req, res) => {
  // Atomically stop the timer to prevent race conditions from concurrent requests
  const now = new Date();
  const u = await User.findOneAndUpdate(
    { userId: req.user.userId, timerRunning: true },
    { $set: { timerRunning: false, timerStartedAt: null } },
    { new: false } // return the document BEFORE the update to get timerStartedAt
  );
  if (!u) return res.status(409).json({ error: 'Timer not running' });

  const startedAt = u.timerStartedAt;
  const sessionMs = now.getTime() - startedAt.getTime();
  const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

  let todaySeconds = 0;
  if (sessionSeconds >= 1) {
    const date = now.toISOString().slice(0, 10);
    const record = await TrackingData.findOneAndUpdate(
      { userId: req.user.userId, date },
      {
        $inc: { seconds: sessionSeconds },
        $push: {
          sessions: {
            start: startedAt,
            end: now,
            duration: sessionSeconds,
          },
        },
      },
      { upsert: true, new: true }
    );
    todaySeconds = record.seconds;

    // Get previous total for goal-reached detection
    const previousTotalSeconds = todaySeconds - sessionSeconds;
    const todayGoalSeconds = (await getEffectiveGoalMinutes(u, date)) * 60;
    const goalReachedNow = todaySeconds >= todayGoalSeconds && previousTotalSeconds < todayGoalSeconds;

    const oldLevel = u.level || 1;

    // Single source of truth: recalculate all stats
    const stats = await recalcUserStats(req.user.userId);

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.userId}`).emit('STATS_UPDATE', {
        ...stats,
        todaySeconds,
      });

      // Notify friends that this user's stats updated (for live heatmap refresh)
      io.to(`friends:${req.user.userId}`).emit('FRIEND_STATS_UPDATE', { userId: req.user.userId });

      // Level up notification
      if (stats.level > oldLevel) {
        const titles = ['', 'Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal'];
        const notif = await Notification.create({
          userId: req.user.userId,
          type: 'level_up',
          title: 'Level Up!',
          message: `You reached Level ${stats.level} — ${titles[stats.level] || 'Master'}!`,
          data: { level: stats.level },
        });
        io.to(`user:${req.user.userId}`).emit('NOTIFICATION', notif.toObject());
        sendPushNotification(req.user.userId, 'level_up', {
          title: 'StandUpTracker',
          body: notif.message,
        }).catch(() => {});
      }

      // Daily goal reached notification
      if (goalReachedNow) {
        const notif = await Notification.create({
          userId: req.user.userId,
          type: 'daily_goal_reached',
          title: 'Daily Goal Reached!',
          message: `You hit your ${Math.round(todayGoalSeconds / 60)}-minute daily goal. Great work!`,
          data: { minutes: Math.round(todayGoalSeconds / 60) },
        });
        io.to(`user:${req.user.userId}`).emit('NOTIFICATION', notif.toObject());
        sendPushNotification(req.user.userId, 'daily_goal_reached', {
          title: 'StandUpTracker',
          body: notif.message,
        }).catch(() => {});
      }
    }

    // Fire-and-forget: sync friend & group streaks
    syncFriendStreaks(req.user.userId).catch(() => {});
    syncGroupStreaks(req.user.userId).catch(() => {});
  }

  // Broadcast timer stop to all user devices
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.user.userId}`).emit('TIMER_SYNC', {
      running: false,
      startedAt: null,
      serverTime: Date.now(),
    });
  }

  res.json({ running: false, sessionSeconds, todaySeconds, serverTime: Date.now() });
});

// Save tracking data
router.post('/tracking', requireVerified, currentDayGuard, async (req, res) => {
  try {
    const { date, seconds, session } = req.body;
    if (!date || seconds == null) {
      return res.status(400).json({ error: 'Date and seconds required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (YYYY-MM-DD required)' });
    }
    const clampedSeconds = Math.min(Math.max(Math.round(Number(seconds)), 0), 86400);
    if (isNaN(clampedSeconds)) {
      return res.status(400).json({ error: 'seconds must be a number' });
    }

    const record = await TrackingData.findOneAndUpdate(
      { userId: req.user.userId, date },
      {
        $set: { seconds: clampedSeconds },
        $push: session ? { sessions: session } : {},
      },
      { upsert: true, new: true }
    );

    // Single source of truth: recalculate all stats
    await recalcUserStats(req.user.userId);

    res.json({ success: true, record });

    // Fire-and-forget: sync friend & group streaks
    syncFriendStreaks(req.user.userId).catch(() => {});
    syncGroupStreaks(req.user.userId).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to save tracking data' });
  }
});

// Get tracking data
router.get('/tracking', requireVerified, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { userId: req.user.userId };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    const data = await TrackingData.find(query).sort({ date: -1 }).limit(365);

    // Also return off days so frontend can render them
    const offDays = await OffDay.find({ userId: req.user.userId });
    const offDaySet = {};
    offDays.forEach(o => { offDaySet[o.date] = true; });

    const result = {};
    data.forEach(d => { result[d.date] = d.seconds; });
    res.json({ tracking: result, offDays: offDaySet });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

// Bulk sync (for initial migration from localStorage)
router.post('/tracking/sync', requireVerified, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const entries = Object.entries(data);
    if (entries.length > 365) {
      return res.status(400).json({ error: 'Cannot sync more than 365 records at once' });
    }

    const ops = [];
    for (const [date, seconds] of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date > today) continue;
      const clampedSeconds = Math.min(Math.max(Math.round(Number(seconds)), 0), 86400);
      if (!isNaN(clampedSeconds)) {
        ops.push({
          updateOne: {
            filter: { userId: req.user.userId, date },
            update: { $set: { seconds: clampedSeconds } },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) {
      await TrackingData.bulkWrite(ops);
    }

    // Single source of truth: recalculate all stats
    await recalcUserStats(req.user.userId);

    const allData = await TrackingData.find({ userId: req.user.userId });
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);

    res.json({ message: `Synced ${ops.length} records`, synced: ops.length, totalSeconds });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Get user stats
router.get('/stats', async (req, res) => {
  const u = req.user;
  const effectiveGoal = await getEffectiveGoalMinutes(u);
  res.json({
    totalStandingSeconds: u.totalStandingSeconds,
    totalDays: u.totalDays,
    currentStreak: u.currentStreak,
    bestStreak: u.bestStreak,
    level: u.level,
    dailyGoalMinutes: effectiveGoal,
  });
});

// ─── Extended user stats ───
router.get('/stats/extended', requireVerified, async (req, res) => {
  try {
    const userId = req.user.userId;
    const allData = await TrackingData.find({ userId }).sort({ date: 1 });
    const effectiveGoal = await getEffectiveGoalMinutes(req.user);
    const goalSeconds = effectiveGoal * 60;
    const enforceDailyGoal = await getSetting('enforceDailyGoal');
    const minThresholdSeconds = await getMinActivityThresholdSeconds();

    // Load off days
    const offDays = await OffDay.find({ userId });
    const offDaySet = new Set(offDays.map(o => o.date));

    const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
    const totalHours = totalSeconds / 3600;
    const currentLevel = req.user.level || 1;
    const currentLevelThreshold = levels[currentLevel - 1] || 0;
    const nextLevelThreshold = levels[currentLevel] || null;
    const levelProgress = nextLevelThreshold
      ? Math.min(100, Math.round(((totalHours - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100))
      : 100;

    // Filter out off days and days below activity threshold for stats
    const statsData = allData.filter(d =>
      !offDaySet.has(d.date) && d.seconds >= minThresholdSeconds
    );

    // Personal records (using statsData — excludes off days and below-threshold)
    let longestSession = null;
    let bestDay = null;
    let totalSessions = 0;
    let totalSessionDuration = 0;
    const dayMap = {};

    for (const rec of allData) {
      dayMap[rec.date] = rec.seconds;
    }

    for (const rec of statsData) {
      const sessions = rec.sessions || [];
      totalSessions += sessions.length;
      for (const s of sessions) {
        const dur = s.duration || (s.end && s.start ? (new Date(s.end) - new Date(s.start)) / 1000 : 0);
        totalSessionDuration += dur;
        if (!longestSession || dur > longestSession.duration) {
          longestSession = { duration: dur, date: rec.date };
        }
      }
      if (!bestDay || rec.seconds > bestDay.seconds) {
        bestDay = { seconds: rec.seconds, date: rec.date };
      }
    }

    // Best week / month (using statsData)
    let bestWeek = { seconds: 0, weekStart: null };
    let bestMonth = { seconds: 0, month: null };
    const monthTotals = {};
    const weekTotals = {};

    for (const rec of statsData) {
      const month = rec.date.slice(0, 7);
      monthTotals[month] = (monthTotals[month] || 0) + rec.seconds;
      if (monthTotals[month] > bestMonth.seconds) {
        bestMonth = { seconds: monthTotals[month], month };
      }
      const d = new Date(rec.date + 'T00:00:00');
      const dayOfWeek = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek + 1);
      const weekKey = monday.toISOString().slice(0, 10);
      weekTotals[weekKey] = (weekTotals[weekKey] || 0) + rec.seconds;
      if (weekTotals[weekKey] > bestWeek.seconds) {
        bestWeek = { seconds: weekTotals[weekKey], weekStart: weekKey };
      }
    }

    const avgSessionDuration = totalSessions > 0 ? Math.round(totalSessionDuration / totalSessions) : 0;

    // Progress & Trends
    const now = new Date();
    const thisWeekStart = new Date(now);
    const dayNum = thisWeekStart.getDay() || 7;
    thisWeekStart.setDate(thisWeekStart.getDate() - dayNum + 1);
    const thisWeekKey = thisWeekStart.toISOString().slice(0, 10);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekKey = lastWeekStart.toISOString().slice(0, 10);

    const thisWeekSecs = weekTotals[thisWeekKey] || 0;
    const lastWeekSecs = weekTotals[lastWeekKey] || 0;
    const weekOverWeekChange = lastWeekSecs > 0 ? Math.round(((thisWeekSecs - lastWeekSecs) / lastWeekSecs) * 100) : (thisWeekSecs > 0 ? 100 : 0);

    const thisMonthKey = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthKey = lastMonthDate.toISOString().slice(0, 7);
    const thisMonthSecs = monthTotals[thisMonthKey] || 0;
    const lastMonthSecs = monthTotals[lastMonthKey] || 0;
    const monthOverMonthChange = lastMonthSecs > 0 ? Math.round(((thisMonthSecs - lastMonthSecs) / lastMonthSecs) * 100) : (thisMonthSecs > 0 ? 100 : 0);

    // Consistency score (last 30 non-off days)
    let goalMetLast30 = 0;
    let countedDays30 = 0;
    for (let i = 0; i < 60 && countedDays30 < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (offDaySet.has(ds)) continue;
      countedDays30++;
      if ((dayMap[ds] || 0) >= goalSeconds) goalMetLast30++;
    }
    const consistencyScore = countedDays30 > 0 ? Math.round((goalMetLast30 / countedDays30) * 100) : 0;

    // Goal tracking
    let goalMetThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisWeekStart);
      d.setDate(d.getDate() + i);
      if (d > now) break;
      const ds = d.toISOString().slice(0, 10);
      if (offDaySet.has(ds)) continue;
      if ((dayMap[ds] || 0) >= goalSeconds) goalMetThisWeek++;
    }

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let goalMetThisMonth = 0;
    for (let d = new Date(thisMonthStart); d <= now; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (offDaySet.has(ds)) continue;
      if ((dayMap[ds] || 0) >= goalSeconds) goalMetThisMonth++;
    }

    // All-time goal completion rate (excluding off days and below-threshold days)
    const totalTrackedDays = statsData.length;
    const totalGoalMet = statsData.filter(d => d.seconds >= goalSeconds).length;
    const goalCompletionRate = totalTrackedDays > 0 ? Math.round((totalGoalMet / totalTrackedDays) * 100) : 0;

    res.json({
      personalRecords: {
        longestSession: longestSession ? { seconds: Math.round(longestSession.duration), date: longestSession.date } : null,
        bestDay: bestDay ? { seconds: bestDay.seconds, date: bestDay.date } : null,
        bestWeek: bestWeek.weekStart ? bestWeek : null,
        bestMonth: bestMonth.month ? bestMonth : null,
        totalSessions,
        totalSeconds,
        avgSessionDuration,
      },
      progress: {
        level: currentLevel,
        nextLevel: nextLevelThreshold ? currentLevel + 1 : null,
        levelProgress,
        currentLevelHours: currentLevelThreshold,
        nextLevelHours: nextLevelThreshold,
        totalHours: Math.round(totalHours * 10) / 10,
        weekOverWeekChange,
        monthOverMonthChange,
        consistencyScore,
      },
      goals: {
        dailyGoalMinutes: effectiveGoal,
        enforced: !!enforceDailyGoal,
        goalMetThisWeek,
        goalMetThisMonth,
        goalCompletionRate,
        daysTracked: totalTrackedDays,
        daysGoalMet: totalGoalMet,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch extended stats' });
  }
});

// ─── Time editing is admin-only (via /api/admin/tracking endpoints) ───
// Reject any non-admin attempt to edit recorded time
router.put('/my-times/:date', (req, res) => {
  res.status(403).json({ error: 'Time editing is restricted to administrators' });
});
router.delete('/my-times/:date/override', (req, res) => {
  res.status(403).json({ error: 'Time editing is restricted to administrators' });
});

// ─── Forgotten Checkout ───

// Detect stale timer (forgotten checkout)
router.get('/timer/forgotten-checkout', requireVerified, async (req, res) => {
  try {
    const u = await User.findOne({ userId: req.user.userId }).select('timerRunning timerStartedAt');
    if (!u || !u.timerRunning || !u.timerStartedAt) {
      return res.json({ forgotten: false });
    }

    const thresholdHours = await Settings.get('forgottenCheckoutThresholdHours') || 8;
    const elapsed = Date.now() - u.timerStartedAt.getTime();
    const thresholdMs = thresholdHours * 60 * 60 * 1000;

    if (elapsed >= thresholdMs) {
      return res.json({
        forgotten: true,
        startedAt: u.timerStartedAt.getTime(),
        elapsedMs: elapsed,
        thresholdHours,
      });
    }

    res.json({ forgotten: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check forgotten checkout' });
  }
});

// Finalize forgotten checkout with corrected end time
router.post('/timer/forgotten-checkout/finalize', requireVerified, async (req, res) => {
  try {
    const { correctedEndTime } = req.body;
    if (!correctedEndTime) {
      return res.status(400).json({ error: 'correctedEndTime required (ISO string or timestamp)' });
    }

    const u = await User.findOneAndUpdate(
      { userId: req.user.userId, timerRunning: true },
      { $set: { timerRunning: false, timerStartedAt: null } },
      { new: false }
    );
    if (!u || !u.timerStartedAt) {
      return res.status(409).json({ error: 'Timer not running' });
    }

    const startedAt = u.timerStartedAt;
    const endTime = new Date(correctedEndTime);

    if (isNaN(endTime.getTime())) {
      // Re-enable timer since we failed to process
      await User.updateOne({ userId: req.user.userId }, { $set: { timerRunning: true, timerStartedAt: startedAt } });
      return res.status(400).json({ error: 'Invalid correctedEndTime' });
    }

    if (endTime <= startedAt) {
      await User.updateOne({ userId: req.user.userId }, { $set: { timerRunning: true, timerStartedAt: startedAt } });
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Corrected end time must be on the same calendar day as start (max 23:59:59)
    const startDate = startedAt.toISOString().slice(0, 10);
    const endDate = endTime.toISOString().slice(0, 10);
    if (startDate !== endDate) {
      await User.updateOne({ userId: req.user.userId }, { $set: { timerRunning: true, timerStartedAt: startedAt } });
      return res.status(400).json({ error: 'Corrected end time must be on the same day as the start time' });
    }

    const sessionMs = endTime.getTime() - startedAt.getTime();
    const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

    if (sessionSeconds >= 1) {
      const date = startedAt.toISOString().slice(0, 10);
      await TrackingData.findOneAndUpdate(
        { userId: req.user.userId, date },
        {
          $inc: { seconds: sessionSeconds },
          $push: {
            sessions: {
              start: startedAt,
              end: endTime,
              duration: sessionSeconds,
              forgottenCheckout: true,
            },
          },
        },
        { upsert: true, new: true }
      );

      await recalcUserStats(req.user.userId);
      syncFriendStreaks(req.user.userId).catch(() => {});
      syncGroupStreaks(req.user.userId).catch(() => {});

      // Audit log
      await AuditLog.create({
        action: 'forgotten_checkout_finalize',
        performedBy: req.user.userId,
        target: req.user.userId,
        details: {
          startedAt: startedAt.toISOString(),
          correctedEndTime: endTime.toISOString(),
          sessionSeconds,
          date,
        },
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.userId}`).emit('TIMER_SYNC', {
        running: false,
        startedAt: null,
        serverTime: Date.now(),
      });
      const stats = await recalcUserStats(req.user.userId);
      io.to(`user:${req.user.userId}`).emit('STATS_UPDATE', stats);
      io.to(`friends:${req.user.userId}`).emit('FRIEND_STATS_UPDATE', { userId: req.user.userId });
      io.to('authenticated').emit('LEADERBOARD_UPDATE');
    }

    res.json({ message: 'Forgotten checkout finalized', sessionSeconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to finalize forgotten checkout' });
  }
});

// Discard forgotten checkout (clear timer without saving)
router.post('/timer/forgotten-checkout/discard', requireVerified, async (req, res) => {
  try {
    const u = await User.findOneAndUpdate(
      { userId: req.user.userId, timerRunning: true },
      { $set: { timerRunning: false, timerStartedAt: null } },
      { new: false }
    );
    if (!u) {
      return res.status(409).json({ error: 'Timer not running' });
    }

    await AuditLog.create({
      action: 'forgotten_checkout_discard',
      performedBy: req.user.userId,
      target: req.user.userId,
      details: {
        startedAt: u.timerStartedAt?.toISOString(),
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.userId}`).emit('TIMER_SYNC', {
        running: false,
        startedAt: null,
        serverTime: Date.now(),
      });
    }

    res.json({ message: 'Forgotten checkout discarded' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to discard forgotten checkout' });
  }
});

module.exports = router;
