const express = require('express');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');

const router = express.Router();

// Public leaderboard
router.get('/', async (req, res) => {
  try {
    const { period = 'all', limit = 50 } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    let matchStage = {};
    if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchStage = { date: { $gte: weekAgo.toISOString().slice(0, 10) } };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      matchStage = { date: { $gte: monthAgo.toISOString().slice(0, 10) } };
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

    // Fetch usernames
    const userIds = rankings.map(r => r._id);
    const users = await User.find({ userId: { $in: userIds }, active: true }).select('userId username level');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    const leaderboard = rankings
      .filter(r => userMap[r._id]) // exclude deleted/inactive users
      .map((r, i) => ({
      rank: i + 1,
      username: userMap[r._id]?.username || 'Unknown',
      level: userMap[r._id]?.level || 1,
      totalSeconds: r.totalSeconds,
      daysActive: r.daysActive,
      totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
    }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
