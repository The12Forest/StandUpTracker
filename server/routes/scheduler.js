const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const OffDay = require('../models/OffDay');
const Group = require('../models/Group');
const User = require('../models/User');
const Settings = require('../models/Settings');

const router = express.Router();
router.use(authenticate, softBanCheck, lastActiveTouch);

// Get personal sessions for a week
router.get('/sessions', requireVerified, async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart (YYYY-MM-DD) required' });
    }

    const weekEnd = new Date(weekStart + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const tracking = await TrackingData.find({
      userId: req.user.userId,
      date: { $gte: weekStart, $lte: weekEndStr },
    });

    const offDays = await OffDay.find({
      userId: req.user.userId,
      date: { $gte: weekStart, $lte: weekEndStr },
    });

    const days = {};
    for (const t of tracking) {
      days[t.date] = {
        seconds: t.seconds,
        sessions: (t.sessions || []).map(s => ({
          start: s.start,
          end: s.end,
          duration: s.duration,
          forgottenCheckout: s.forgottenCheckout || false,
        })),
      };
    }

    const offDaySet = {};
    offDays.forEach(o => { offDaySet[o.date] = true; });

    res.json({ days, offDays: offDaySet });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Create off day (user self-service)
router.post('/off-days', requireVerified, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) required' });
    }

    await OffDay.findOneAndUpdate(
      { userId: req.user.userId, date },
      { userId: req.user.userId, date },
      { upsert: true }
    );

    res.json({ message: 'Off day marked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark off day' });
  }
});

// Remove off day (user self-service)
router.delete('/off-days/:date', requireVerified, async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    await OffDay.deleteOne({ userId: req.user.userId, date });
    res.json({ message: 'Off day removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove off day' });
  }
});

// Get group members' sessions for a week (shared scheduler view)
router.get('/group/:groupId', requireVerified, async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart (YYYY-MM-DD) required' });
    }

    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some(m => m.userId === req.user.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const weekEnd = new Date(weekStart + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const memberIds = group.members.map(m => m.userId);
    const users = await User.find({ userId: { $in: memberIds } }).select('userId username');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u.username; });

    const tracking = await TrackingData.find({
      userId: { $in: memberIds },
      date: { $gte: weekStart, $lte: weekEndStr },
    });

    const offDays = await OffDay.find({
      userId: { $in: memberIds },
      date: { $gte: weekStart, $lte: weekEndStr },
    });

    const members = {};
    for (const uid of memberIds) {
      members[uid] = {
        username: userMap[uid] || 'Unknown',
        days: {},
        offDays: {},
      };
    }

    for (const t of tracking) {
      if (!members[t.userId]) continue;
      members[t.userId].days[t.date] = {
        seconds: t.seconds,
        sessions: (t.sessions || []).map(s => ({
          start: s.start,
          end: s.end,
          duration: s.duration,
          forgottenCheckout: s.forgottenCheckout || false,
        })),
      };
    }

    for (const o of offDays) {
      if (members[o.userId]) {
        members[o.userId].offDays[o.date] = true;
      }
    }

    res.json({ groupName: group.name, members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group schedule' });
  }
});

module.exports = router;
