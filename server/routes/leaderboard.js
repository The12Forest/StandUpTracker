const express = require('express');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const { getSetting } = require('../utils/settings');

const router = express.Router();

// Helper: get start of current week based on firstDayOfWeek setting
function getWeekStart(firstDay) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = firstDay === 'sunday' ? day : ((day + 6) % 7);
  const start = new Date(now);
  start.setDate(start.getDate() - diff);
  return start.toISOString().slice(0, 10);
}

// Helper: get start of current month
function getMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// Public leaderboard
router.get('/', async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);
    const today = new Date().toISOString().slice(0, 10);

    let matchStage = {};
    if (period === 'today') {
      matchStage = { date: today };
    } else if (period === 'week') {
      const firstDay = await getSetting('firstDayOfWeek') || 'monday';
      matchStage = { date: { $gte: getWeekStart(firstDay) } };
    } else if (period === 'month') {
      matchStage = { date: { $gte: getMonthStart() } };
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: '$userId',
          totalSeconds: { $sum: '$seconds' },
          daysActive: { $sum: 1 },
        },
      },
      { $sort: { totalSeconds: -1 } },
      { $limit: safeLimit },
    ];

    const rankings = await TrackingData.aggregate(pipeline);

    // Fetch users with timer state
    const userIds = rankings.map(r => r._id);
    const users = await User.find({ userId: { $in: userIds }, active: true, deletedAt: null })
      .select('userId username level timerRunning timerStartedAt currentStreak');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    const leaderboard = rankings
      .filter(r => userMap[r._id])
      .map((r, i) => ({
        rank: i + 1,
        userId: userMap[r._id].userId,
        username: userMap[r._id]?.username || 'Unknown',
        level: userMap[r._id]?.level || 1,
        totalSeconds: r.totalSeconds,
        totalDays: r.daysActive,
        totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
        timerRunning: userMap[r._id]?.timerRunning || false,
        timerStartedAt: userMap[r._id]?.timerStartedAt || null,
        currentStreak: userMap[r._id]?.currentStreak || 0,
      }));

    // For 'today' period, also include users with active timers who may not have tracking data yet
    if (period === 'today') {
      const existingIds = new Set(leaderboard.map(e => e.userId));
      const activeUsers = await User.find({
        timerRunning: true,
        active: true,
        deletedAt: null,
        userId: { $nin: [...existingIds] },
      }).select('userId username level timerRunning timerStartedAt currentStreak');

      for (const u of activeUsers) {
        leaderboard.push({
          rank: 0,
          userId: u.userId,
          username: u.username,
          level: u.level || 1,
          totalSeconds: 0,
          totalDays: 0,
          totalHours: 0,
          timerRunning: true,
          timerStartedAt: u.timerStartedAt,
          currentStreak: u.currentStreak || 0,
        });
      }

      // Re-sort: for today view, running timers should show live elapsed
      // Client handles live elapsed display, just sort by totalSeconds desc
      leaderboard.sort((a, b) => b.totalSeconds - a.totalSeconds);
      leaderboard.forEach((e, i) => { e.rank = i + 1; });
    }

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
