const express = require('express');
const { authenticate } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const Notification = require('../models/Notification');

const router = express.Router();

router.use(authenticate, softBanCheck, lastActiveTouch);

// List notifications (newest first, max 50)
router.get('/', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = await Notification.countDocuments({ userId: req.user.userId, read: false });
    res.json({ notifications, unreadCount });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Unread count only
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user.userId, read: false });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// Mark one as read
router.put('/:id/read', async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, userId: req.user.userId },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

// Mark all as read
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark notifications' });
  }
});

module.exports = router;
