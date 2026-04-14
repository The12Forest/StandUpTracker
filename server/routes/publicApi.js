/**
 * Public REST API — v1 timer endpoints.
 * All routes require a valid API key (Bearer token or ?api_key= query parameter).
 * Integrates with the same server-authoritative timer system used by the WebSocket UI.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');
const Notification = require('../models/Notification');
const { getEffectiveGoalMinutes } = require('../utils/settings');
const { checkAndSetGoalMet } = require('../utils/streaks');
const { recalcUserStats } = require('../utils/recalcStats');
const { sendPushNotification } = require('../utils/pushSender');
const { shouldDispatchNotification, incrementNotificationCount } = require('../utils/notificationGate');
const { dispatchWebhook } = require('../utils/webhookDispatch');
const logger = require('../utils/logger');
const { authenticateApiKey } = require('../middleware/auth');

const router = express.Router();

// Rate limit: 60 requests per minute per API key (keyed on the raw key value in the header/query)
const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    return req.query.api_key || req.ip;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded. Maximum 60 requests per minute per API key.' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(apiRateLimit);
router.use(authenticateApiKey);

/**
 * GET /api/v1/timer/status
 * Returns the current timer state for the key owner.
 */
router.get('/timer/status', async (req, res) => {
  try {
    const { userId } = req.user;
    const u = await User.findOne({ userId }).select('timerRunning timerStartedAt').lean();
    if (!u) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayData = await TrackingData.findOne({ userId, date: today }).select('seconds').lean();

    let elapsedSeconds = 0;
    if (u.timerRunning && u.timerStartedAt) {
      elapsedSeconds = Math.max(0, Math.round((now.getTime() - new Date(u.timerStartedAt).getTime()) / 1000));
    }

    res.json({
      running: !!u.timerRunning,
      startedAt: u.timerStartedAt ? u.timerStartedAt.toISOString() : null,
      elapsedSeconds,
      todayTotalSeconds: (todayData?.seconds || 0) + (u.timerRunning ? elapsedSeconds : 0),
    });
  } catch (err) {
    logger.error(`v1/timer/status error: ${err.message}`, { source: 'publicApi' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/timer/start
 * Starts the timer for the key owner if not already running.
 */
router.get('/timer/start', async (req, res) => {
  try {
    const { userId } = req.user;
    const now = new Date();

    // Atomically start only if not already running
    const u = await User.findOneAndUpdate(
      { userId, timerRunning: { $ne: true } },
      { $set: { timerRunning: true, timerStartedAt: now } },
      { new: true }
    );

    if (!u) {
      // Timer was already running — fetch current state
      const current = await User.findOne({ userId }).select('timerStartedAt').lean();
      return res.json({
        success: false,
        message: 'Timer already running',
        startedAt: current?.timerStartedAt ? current.timerStartedAt.toISOString() : null,
      });
    }

    // Broadcast to all of the user's connected devices
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('TIMER_SYNC', {
        running: true,
        startedAt: now.getTime(),
        serverTime: Date.now(),
      });
      io.to('authenticated').emit('LEADERBOARD_UPDATE');
    }

    // Webhook: timer.started
    dispatchWebhook(userId, 'timer.started', { startedAt: now.toISOString() }).catch(() => {});

    logger.info(`Timer started via API key for ${req.user.username}`, { source: 'publicApi', userId });

    res.json({
      success: true,
      startedAt: now.toISOString(),
      message: 'Timer started',
    });
  } catch (err) {
    logger.error(`v1/timer/start error: ${err.message}`, { source: 'publicApi' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/timer/stop
 * Stops the currently running timer for the key owner.
 */
router.get('/timer/stop', async (req, res) => {
  try {
    const { userId } = req.user;
    const now = new Date();

    // Atomically stop — returns the document BEFORE the update (to get timerStartedAt)
    const u = await User.findOneAndUpdate(
      { userId, timerRunning: true },
      { $set: { timerRunning: false, timerStartedAt: null } },
      { new: false }
    );

    if (!u) {
      return res.json({ success: false, message: 'No timer running' });
    }

    const startedAt = u.timerStartedAt;
    const sessionMs = now.getTime() - startedAt.getTime();
    const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

    let todayTotalSeconds = 0;

    if (sessionSeconds >= 1) {
      const date = now.toISOString().slice(0, 10);
      const record = await TrackingData.findOneAndUpdate(
        { userId, date },
        {
          $inc: { seconds: sessionSeconds },
          $push: { sessions: { start: startedAt, end: now, duration: sessionSeconds } },
        },
        { upsert: true, new: true }
      );

      todayTotalSeconds = record.seconds;

      const previousTotalSeconds = record.seconds - sessionSeconds;
      const todayGoalSeconds = (await getEffectiveGoalMinutes(u, date)) * 60;
      const goalReachedNow = record.seconds >= todayGoalSeconds && previousTotalSeconds < todayGoalSeconds;
      const oldLevel = u.level || 1;

      const stats = await recalcUserStats(userId);

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('STATS_UPDATE', { ...stats, todaySeconds: record.seconds });
        io.to(`friends:${userId}`).emit('FRIEND_STATS_UPDATE', { userId });

        // Level up notification
        if (stats.level > oldLevel && await shouldDispatchNotification(userId, 'level_up')) {
          const titles = ['', 'Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal'];
          const notif = await Notification.create({
            userId, type: 'level_up', title: 'Level Up!',
            message: `You reached Level ${stats.level} — ${titles[stats.level] || 'Master'}!`,
            data: { level: stats.level },
          });
          await incrementNotificationCount(userId);
          io.to(`user:${userId}`).emit('NOTIFICATION', notif.toObject());
          sendPushNotification(userId, 'level_up', { title: 'StandUpTracker', body: notif.message }).catch(() => {});
        }

        // Goal reached notification
        if (goalReachedNow && await shouldDispatchNotification(userId, 'daily_goal_reached')) {
          const notif = await Notification.create({
            userId, type: 'daily_goal_reached', title: 'Daily Goal Reached!',
            message: `You hit your ${Math.round(todayGoalSeconds / 60)}-minute daily goal. Great work!`,
            data: { minutes: Math.round(todayGoalSeconds / 60) },
          });
          await incrementNotificationCount(userId);
          io.to(`user:${userId}`).emit('NOTIFICATION', notif.toObject());
          sendPushNotification(userId, 'daily_goal_reached', { title: 'StandUpTracker', body: notif.message }).catch(() => {});
          // Webhook: goal.reached
          dispatchWebhook(userId, 'goal.reached', { minutes: Math.round(todayGoalSeconds / 60), todayTotalSeconds: record.seconds }).catch(() => {});
        }

        io.to(`user:${userId}`).emit('TIMER_SYNC', { running: false, startedAt: null, serverTime: Date.now() });
        io.to('authenticated').emit('LEADERBOARD_UPDATE');
      }

      // Webhook: timer.stopped
      dispatchWebhook(userId, 'timer.stopped', { durationSeconds: sessionSeconds, todayTotalSeconds }).catch(() => {});

      checkAndSetGoalMet(userId, date, io).catch(() => {});
    }

    logger.info(`Timer stopped via API key for ${req.user.username} (${sessionSeconds}s)`, { source: 'publicApi', userId });

    res.json({
      success: true,
      stoppedAt: now.toISOString(),
      durationSeconds: sessionSeconds,
      todayTotalSeconds,
      message: 'Timer stopped',
    });
  } catch (err) {
    logger.error(`v1/timer/stop error: ${err.message}`, { source: 'publicApi' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
