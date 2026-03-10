const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { currentDayGuard, softBanCheck, lastActiveTouch } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const { syncFriendStreaks, syncGroupStreaks } = require('../utils/streaks');

const router = express.Router();

// Apply soft-ban and last-active to all authenticated routes
router.use(authenticate, softBanCheck, lastActiveTouch);

// Save tracking data
router.post('/tracking', requireVerified, currentDayGuard, async (req, res) => {
  try {
    const { date, seconds, session } = req.body;
    if (!date || seconds == null) {
      return res.status(400).json({ error: 'Date and seconds required' });
    }

    const record = await TrackingData.findOneAndUpdate(
      { userId: req.user.userId, date },
      {
        $set: { seconds },
        $push: session ? { sessions: session } : {},
      },
      { upsert: true, new: true }
    );

    // Update user aggregate stats
    const allData = await TrackingData.find({ userId: req.user.userId });
    const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
    const totalDays = allData.filter(d => d.seconds > 180).length;
    const goalSeconds = req.user.dailyGoalMinutes * 60;

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
      if ((dataMap[dateStr] || 0) >= goalSeconds) currentStreak++;
      else break;
    }

    let bestStreak = 0, run = 0;
    // Walk forward through all calendar days from first tracked to last
    if (sorted.length > 0) {
      const firstDate = new Date(sorted[sorted.length - 1] + 'T00:00:00');
      const lastDate = new Date(sorted[0] + 'T00:00:00');
      for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        if ((dataMap[dateStr] || 0) >= goalSeconds) { run++; bestStreak = Math.max(bestStreak, run); }
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
router.get('/tracking', async (req, res) => {
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

    const ops = Object.entries(data).map(([date, seconds]) => ({
      updateOne: {
        filter: { userId: req.user.userId, date },
        update: { $set: { seconds } },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await TrackingData.bulkWrite(ops);
    }

    res.json({ message: `Synced ${ops.length} records` });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Get user stats
router.get('/stats', async (req, res) => {
  const u = req.user;
  res.json({
    totalStandingSeconds: u.totalStandingSeconds,
    totalDays: u.totalDays,
    currentStreak: u.currentStreak,
    bestStreak: u.bestStreak,
    level: u.level,
    dailyGoalMinutes: u.dailyGoalMinutes,
  });
});

module.exports = router;
