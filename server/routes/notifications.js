const express = require('express');
const { authenticate } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const { getSetting } = require('../utils/settings');

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

// Mark all as read (MUST be before /:id/read so Express doesn't capture "read-all" as an id)
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

// ─── Push Subscription Endpoints ───

// Get VAPID public key (needed by frontend to subscribe)
router.get('/push/vapid-key', async (req, res) => {
  try {
    const publicKey = await getSetting('vapidPublicKey');
    if (!publicKey) return res.status(404).json({ error: 'Push notifications not configured' });
    res.json({ publicKey });
  } catch {
    res.status(500).json({ error: 'Failed to fetch VAPID key' });
  }
});

// Subscribe to push notifications
router.post('/push/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }

    await PushSubscription.findOneAndUpdate(
      { userId: req.user.userId, endpoint: subscription.endpoint },
      {
        userId: req.user.userId,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent: req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    // Enable push on the user profile
    await User.updateOne(
      { userId: req.user.userId },
      { $set: { pushEnabled: true } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Unsubscribe from push notifications
router.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      // Remove specific subscription
      await PushSubscription.deleteOne({ userId: req.user.userId, endpoint });
    } else {
      // Remove all subscriptions for this user
      await PushSubscription.deleteMany({ userId: req.user.userId });
    }

    // Check if user has any remaining subscriptions
    const remaining = await PushSubscription.countDocuments({ userId: req.user.userId });
    if (remaining === 0) {
      await User.updateOne(
        { userId: req.user.userId },
        { $set: { pushEnabled: false } }
      );
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Update push notification preferences
router.put('/push/preferences', async (req, res) => {
  try {
    const { pushPreferences, standupReminderTime } = req.body;
    const update = {};

    if (pushPreferences && typeof pushPreferences === 'object') {
      const allowed = ['standup_reminder', 'streak_at_risk', 'friend_request', 'level_up', 'daily_goal_reached', 'report_warning', 'report_cleared', 'admin_report_alert'];
      for (const key of allowed) {
        if (typeof pushPreferences[key] === 'boolean') {
          update[`pushPreferences.${key}`] = pushPreferences[key];
        }
      }
    }

    if (standupReminderTime && /^\d{2}:\d{2}$/.test(standupReminderTime)) {
      const [h, m] = standupReminderTime.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        update.standupReminderTime = standupReminderTime;
      }
    }

    if (Object.keys(update).length > 0) {
      await User.updateOne({ userId: req.user.userId }, { $set: update });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
