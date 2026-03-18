const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { currentDayGuard, softBanCheck, lastActiveTouch } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const Notification = require('../models/Notification');
const User = require('../models/User');
const DailyGoalOverride = require('../models/DailyGoalOverride');
const { syncFriendStreaks, syncGroupStreaks } = require('../utils/streaks');
const { getEffectiveGoalMinutes } = require('../utils/settings');
const { recalcUserStats } = require('../utils/recalcStats');

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
  const u = await User.findOne({ userId: req.user.userId });
  if (u.timerRunning) return res.status(409).json({ error: 'Timer already running' });
  const now = new Date();
  u.timerRunning = true;
  u.timerStartedAt = now;
  await u.save();

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
  const u = await User.findOne({ userId: req.user.userId });
  if (!u.timerRunning) return res.status(409).json({ error: 'Timer not running' });

  const startedAt = u.timerStartedAt;
  const now = new Date();
  const sessionMs = now.getTime() - startedAt.getTime();
  const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

  u.timerRunning = false;
  u.timerStartedAt = null;
  await u.save();

  // Save tracking data inline
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

    // Recalculate user aggregate stats
    const allData = await TrackingData.find({ userId: req.user.userId });
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
    const effectiveGoal = await getEffectiveGoalMinutes(u);
    const defaultGoalSeconds = effectiveGoal * 60;

    // Load per-day overrides for accurate streak/totalDays calculation
    const overrides = await DailyGoalOverride.find({ userId: req.user.userId });
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.date] = o.goalMinutes * 60; });
    const getGoalSecondsForDate = (dt) => overrideMap[dt] || defaultGoalSeconds;

    const totalDays = allData.filter(d => d.seconds >= getGoalSecondsForDate(d.date)).length;

    const dataMap = {};
    allData.forEach(d => { dataMap[d.date] = d.seconds; });

    const todayDate = new Date();
    let currentStreak = 0;
    for (let i = 0; i < 3650; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if ((dataMap[dateStr] || 0) >= getGoalSecondsForDate(dateStr)) currentStreak++;
      else break;
    }

    let bestStreak = 0, run = 0;
    const sorted = allData.map(d => d.date).sort();
    if (sorted.length > 0) {
      const firstDate = new Date(sorted[0] + 'T00:00:00');
      const lastDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');
      for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        if ((dataMap[dateStr] || 0) >= getGoalSecondsForDate(dateStr)) { run++; bestStreak = Math.max(bestStreak, run); }
        else run = 0;
      }
    }

    const hours = totalSeconds / 3600;
    const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
    let level = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (hours >= levels[i]) { level = i + 1; break; }
    }

    const oldLevel = u.level || 1;
    const todayTotalSeconds = record.seconds;
    const previousTotalSeconds = todayTotalSeconds - sessionSeconds;
    const todayGoalSeconds = getGoalSecondsForDate(date);
    const goalReachedNow = todayTotalSeconds >= todayGoalSeconds && previousTotalSeconds < todayGoalSeconds;

    await User.updateOne({ userId: req.user.userId }, {
      totalStandingSeconds: totalSeconds,
      totalDays,
      currentStreak,
      bestStreak,
      level,
    });

    const io = req.app.get('io');
    if (io) {
      // Emit real-time stats update to all user devices
      io.to(`user:${req.user.userId}`).emit('STATS_UPDATE', {
        totalStandingSeconds: totalSeconds,
        totalDays,
        currentStreak,
        bestStreak,
        level,
        todaySeconds: todayTotalSeconds,
      });

      // Level up notification
      if (level > oldLevel) {
        const titles = ['', 'Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal'];
        const notif = await Notification.create({
          userId: req.user.userId,
          type: 'level_up',
          title: 'Level Up!',
          message: `You reached Level ${level} — ${titles[level] || 'Master'}!`,
          data: { level },
        });
        io.to(`user:${req.user.userId}`).emit('NOTIFICATION', notif.toObject());
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

  // Include todaySeconds so client can set the correct total directly
  // `record` is already the updated document from findOneAndUpdate above (new: true)
  // Use it directly to avoid a redundant DB query
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

    // Update user aggregate stats
    const allData = await TrackingData.find({ userId: req.user.userId });
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
    const effectiveGoalTracking = await getEffectiveGoalMinutes(req.user);
    const defaultGoalSecondsT = effectiveGoalTracking * 60;

    // Load per-day overrides for accurate streak/totalDays calculation
    const overridesT = await DailyGoalOverride.find({ userId: req.user.userId });
    const overrideMapT = {};
    overridesT.forEach(o => { overrideMapT[o.date] = o.goalMinutes * 60; });
    const getGoalSecondsT = (dt) => overrideMapT[dt] || defaultGoalSecondsT;

    const totalDays = allData.filter(d => d.seconds >= getGoalSecondsT(d.date)).length;

    // Calculate streaks (must account for consecutive calendar days)
    const sorted = allData.map(d => d.date).sort().reverse();
    let currentStreak = 0;
    const dataMap = {};
    allData.forEach(d => { dataMap[d.date] = d.seconds; });

    // Walk backward from today, checking every calendar day
    const todayDate = new Date();
    for (let i = 0; i < 3650; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if ((dataMap[dateStr] || 0) >= getGoalSecondsT(dateStr)) currentStreak++;
      else break;
    }

    let bestStreak = 0, run = 0;
    // Walk forward through all calendar days from first tracked to last
    if (sorted.length > 0) {
      const firstDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');
      const lastDate = new Date(sorted[0] + 'T00:00:00');
      for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        if ((dataMap[dateStr] || 0) >= getGoalSecondsT(dateStr)) { run++; bestStreak = Math.max(bestStreak, run); }
        else run = 0;
      }
    }

    // Level calculation
    const hours = totalSeconds / 3600;
    const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
    let level = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (hours >= levels[i]) { level = i + 1; break; }
    }

    await User.updateOne({ userId: req.user.userId }, {
      totalStandingSeconds: totalSeconds,
      totalDays,
      currentStreak,
      bestStreak,
      level,
    });

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
    const result = {};
    data.forEach(d => { result[d.date] = d.seconds; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

// Bulk sync (for initial migration from localStorage)
router.post('/tracking/sync', requireVerified, async (req, res) => {
  try {
    const { data } = req.body; // { "2024-01-01": 3600, ... }
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // skip invalid dates
      if (date > today) continue; // skip future dates
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

    // Recalculate user aggregate stats after bulk sync
    const allData = await TrackingData.find({ userId: req.user.userId });
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
    const effectiveGoal = await getEffectiveGoalMinutes(req.user);
    const defaultGoalSecondsS = effectiveGoal * 60;

    // Load per-day overrides for accurate streak/totalDays calculation
    const overridesS = await DailyGoalOverride.find({ userId: req.user.userId });
    const overrideMapS = {};
    overridesS.forEach(o => { overrideMapS[o.date] = o.goalMinutes * 60; });
    const getGoalSecondsS = (dt) => overrideMapS[dt] || defaultGoalSecondsS;

    const totalDays = allData.filter(d => d.seconds >= getGoalSecondsS(d.date)).length;
    const dataMap = {};
    allData.forEach(d => { dataMap[d.date] = d.seconds; });

    const todayDate = new Date();
    let currentStreak = 0;
    for (let i = 0; i < 3650; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if ((dataMap[ds] || 0) >= getGoalSecondsS(ds)) currentStreak++;
      else break;
    }
    let bestStreak = 0, run = 0;
    const sorted = allData.map(d => d.date).sort();
    if (sorted.length > 0) {
      const first = new Date(sorted[0] + 'T00:00:00');
      const last = new Date(sorted[sorted.length - 1] + 'T00:00:00');
      for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        if ((dataMap[ds] || 0) >= getGoalSecondsS(ds)) { run++; bestStreak = Math.max(bestStreak, run); }
        else run = 0;
      }
    }
    const hours = totalSeconds / 3600;
    const levels = [0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000];
    let level = 1;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (hours >= levels[i]) { level = i + 1; break; }
    }
    await User.updateOne({ userId: req.user.userId }, { totalStandingSeconds: totalSeconds, totalDays, currentStreak, bestStreak, level });

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

// ─── My Time: user self-service time viewing/editing ───

// GET /my-times — return user's own tracking data + goal info
router.get('/my-times', requireVerified, async (req, res) => {
  try {
    const userId = req.user.userId;
    const data = await TrackingData.find({ userId }).sort({ date: -1 }).limit(365);
    const goalMinutes = await getEffectiveGoalMinutes(req.user);
    res.json({ data, goalMinutes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time data' });
  }
});

// PUT /my-times/:date — edit own recorded time (manual override)
router.put('/my-times/:date', requireVerified, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;
    const { seconds } = req.body;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (seconds == null || seconds < 0 || seconds > 86400) {
      return res.status(400).json({ error: 'Invalid seconds value' });
    }

    const existing = await TrackingData.findOne({ userId, date });
    if (!existing) {
      return res.status(404).json({ error: 'No tracking record for this date' });
    }

    // Store original if this is the first manual override
    if (!existing.manualOverride && existing.originalSeconds == null) {
      existing.originalSeconds = existing.seconds;
    }
    existing.seconds = seconds;
    existing.manualOverride = true;
    await existing.save();

    await recalcUserStats(userId);

    res.json({ message: 'Time updated', date, seconds, manualOverride: true, originalSeconds: existing.originalSeconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update time' });
  }
});

// DELETE /my-times/:date/override — reset manual override to original timer value
router.delete('/my-times/:date/override', requireVerified, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;

    const existing = await TrackingData.findOne({ userId, date });
    if (!existing) {
      return res.status(404).json({ error: 'No tracking record for this date' });
    }
    if (!existing.manualOverride) {
      return res.status(400).json({ error: 'No manual override to reset' });
    }

    existing.seconds = existing.originalSeconds != null ? existing.originalSeconds : existing.seconds;
    existing.manualOverride = false;
    existing.originalSeconds = null;
    await existing.save();

    await recalcUserStats(userId);

    res.json({ message: 'Override reset', date, seconds: existing.seconds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset override' });
  }
});

module.exports = router;
