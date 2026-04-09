const User = require('../models/User');
const Session = require('../models/Session');
const Friendship = require('../models/Friendship');
const Notification = require('../models/Notification');
const TrackingData = require('../models/TrackingData');
const logger = require('../utils/logger');
const { getEffectiveGoalMinutes } = require('../utils/settings');
const { checkAndSetGoalMet } = require('../utils/streaks');
const { recalcUserStats } = require('../utils/recalcStats');
const { sendPushNotification } = require('../utils/pushSender');
const { dispatchWebhook } = require('../utils/webhookDispatch');
const { shouldDispatchNotification, incrementNotificationCount } = require('../utils/notificationGate');

// Global counter state — Single Source of Truth
const counterState = {
  running: false,
  startedBy: null,
  startedAt: null,
};

function setupSocket(io) {
  // Authenticate socket connections via DB session lookup
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const session = await Session.findOne({ sessionId: token });
      if (!session || session.expiresAt < new Date()) {
        return next(new Error('Session expired'));
      }

      const user = await User.findOne({ userId: session.userId, active: true });
      if (!user) return next(new Error('User not found'));

      socket.user = {
        userId: user.userId,
        username: user.username,
        role: user.role,
        emailVerified: !!user.emailVerified,
      };

      // Track impersonation on socket
      if (session.isImpersonation && session.impersonatorUserId) {
        socket.user.impersonator = { userId: session.impersonatorUserId, role: session.impersonatorRole };
      }

      // Store sessionId for later reference
      socket.sessionId = token;

      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, username, role } = socket.user;
    logger.debug(`Socket connected: ${username}`, { source: 'websocket', userId });

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Join role-based rooms
    if (['manager', 'admin', 'super_admin'].includes(role)) {
      socket.join('admins');
    }
    socket.join('authenticated');

    // Join friend rooms & notify friends of online status
    try {
      const friendships = await Friendship.find({
        $or: [{ requester: userId }, { recipient: userId }],
        status: 'accepted',
      });
      for (const f of friendships) {
        const friendId = f.requester === userId ? f.recipient : f.requester;
        socket.join(`friends:${friendId}`);
        // Notify this friend that we came online
        io.to(`user:${friendId}`).emit('FRIEND_ONLINE', { userId, username });
      }
    } catch (err) {
      logger.warn(`Failed to join friend rooms for ${username}`, { source: 'websocket' });
    }

    // Send current counter state on connect (with serverTime for NTP)
    socket.emit('STATE_SYNC', { ...counterState, serverTime: Date.now() });

    // Send personal timer state on connect
    try {
      const u = await User.findOne({ userId }).select('timerRunning timerStartedAt');
      socket.emit('TIMER_SYNC', {
        running: !!u?.timerRunning,
        startedAt: u?.timerStartedAt ? u.timerStartedAt.getTime() : null,
        serverTime: Date.now(),
      });
    } catch { /* best effort */ }

    // Send unread notification count on connect
    try {
      const unreadCount = await Notification.countDocuments({ userId, read: false });
      socket.emit('NOTIFICATION_COUNT', { count: unreadCount });
    } catch { /* best effort */ }

    // Broadcast updated connection count to admins
    broadcastConnectionCount(io);

    // Counter Start
    socket.on('COUNTER_START', () => {
      if (counterState.running) return;
      counterState.running = true;
      counterState.startedBy = username;
      counterState.startedAt = Date.now();

      io.to('authenticated').emit('STATE_SYNC', { ...counterState, serverTime: Date.now() });
      logger.info(`Counter started by ${username}`, { source: 'websocket', userId });

      io.to('admins').emit('ADMIN_BROADCAST', {
        type: 'counter_start',
        message: `Counter started by ${username}`,
        timestamp: Date.now(),
      });
    });

    // Counter Stop
    socket.on('COUNTER_STOP', () => {
      if (!counterState.running) return;
      const duration = counterState.startedAt ? Date.now() - counterState.startedAt : 0;

      counterState.running = false;
      counterState.startedBy = null;
      counterState.startedAt = null;

      io.to('authenticated').emit('STATE_SYNC', { ...counterState, serverTime: Date.now() });
      logger.info(`Counter stopped by ${username} (duration: ${Math.round(duration / 1000)}s)`, {
        source: 'websocket', userId
      });

      io.to('admins').emit('ADMIN_BROADCAST', {
        type: 'counter_stop',
        message: `Counter stopped by ${username}`,
        duration,
        timestamp: Date.now(),
      });
    });

    // Personal tracking sync (user syncs their own timer)
    socket.on('TRACKING_UPDATE', (data) => {
      // Broadcast to user's other devices
      socket.to(`user:${userId}`).emit('TRACKING_SYNC', data);
    });

    // Personal timer start via socket (cross-device)
    socket.on('TIMER_START', async () => {
      try {
        if (!socket.user.emailVerified) return;
        const now = new Date();
        // Atomically start the timer only if it's not already running
        const u = await User.findOneAndUpdate(
          { userId, timerRunning: { $ne: true } },
          { $set: { timerRunning: true, timerStartedAt: now } },
          { new: true }
        );
        if (!u) return; // timer was already running
        io.to(`user:${userId}`).emit('TIMER_SYNC', {
          running: true,
          startedAt: now.getTime(),
          serverTime: Date.now(),
        });
        // Notify leaderboard viewers that a timer started
        io.to('authenticated').emit('LEADERBOARD_UPDATE');
        // Webhook: timer.started
        dispatchWebhook(userId, 'timer.started', { startedAt: now.toISOString() }).catch(() => {});
      } catch (err) {
        logger.warn(`Timer start failed for ${username}: ${err.message}`, { source: 'websocket' });
      }
    });

    // Personal timer stop via socket (cross-device)
    socket.on('TIMER_STOP', async () => {
      try {
        if (!socket.user.emailVerified) return;
        const now = new Date();
        // Atomically stop the timer to prevent race conditions from concurrent events
        const u = await User.findOneAndUpdate(
          { userId, timerRunning: true },
          { $set: { timerRunning: false, timerStartedAt: null } },
          { new: false } // return doc BEFORE update to get timerStartedAt
        );
        if (!u) return; // timer wasn't running
        const startedAt = u.timerStartedAt;
        const sessionMs = now.getTime() - startedAt.getTime();
        const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

        // Save tracking
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

          // Get previous total for goal-reached detection
          const previousTotalSeconds = record.seconds - sessionSeconds;
          const todayGoalSeconds = (await getEffectiveGoalMinutes(u, date)) * 60;
          const goalReachedNow = record.seconds >= todayGoalSeconds && previousTotalSeconds < todayGoalSeconds;

          const oldLevel = u.level || 1;

          // Single source of truth: recalculate all stats
          const stats = await recalcUserStats(userId);

          io.to(`user:${userId}`).emit('STATS_UPDATE', {
            ...stats,
            todaySeconds: record.seconds,
          });

          // Notify friends that this user's stats updated (for live heatmap refresh)
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
            sendPushNotification(userId, 'level_up', {
              title: 'StandUpTracker', body: notif.message,
            }).catch(() => {});
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
            sendPushNotification(userId, 'daily_goal_reached', {
              title: 'StandUpTracker', body: notif.message,
            }).catch(() => {});
            // Webhook: goal.reached
            dispatchWebhook(userId, 'goal.reached', { minutes: Math.round(todayGoalSeconds / 60), todayTotalSeconds: record.seconds }).catch(() => {});
          }

          // Webhook: timer.stopped
          dispatchWebhook(userId, 'timer.stopped', { durationSeconds: sessionSeconds, todayTotalSeconds: record.seconds }).catch(() => {});

          // Trigger A: evaluate goal_met flag and update personal streak
          checkAndSetGoalMet(userId, date, io).catch(() => {});

          // Notify leaderboard viewers
          io.to('authenticated').emit('LEADERBOARD_UPDATE');
        }

        io.to(`user:${userId}`).emit('TIMER_SYNC', {
          running: false,
          startedAt: null,
          serverTime: Date.now(),
        });
      } catch (err) {
        logger.warn(`Timer stop failed for ${username}: ${err.message}`, { source: 'websocket' });
      }
    });

    // Heartbeat for PWA keep-alive
    socket.on('HEARTBEAT', () => {
      socket.emit('HEARTBEAT_ACK', { timestamp: Date.now() });
    });

    // NTP clock synchronization
    socket.on('NTP_PING', (data) => {
      const t1 = Date.now();
      socket.emit('NTP_PONG', { t0: data.t0, t1, t2: Date.now() });
    });

    // Disconnect — notify friends offline
    socket.on('disconnect', async () => {
      logger.debug(`Socket disconnected: ${username}`, { source: 'websocket', userId });

      // Check if user has any remaining sockets before declaring offline
      const remaining = await io.in(`user:${userId}`).fetchSockets();
      if (remaining.length === 0) {
        try {
          const friendships = await Friendship.find({
            $or: [{ requester: userId }, { recipient: userId }],
            status: 'accepted',
          });
          for (const f of friendships) {
            const friendId = f.requester === userId ? f.recipient : f.requester;
            io.to(`user:${friendId}`).emit('FRIEND_OFFLINE', { userId, username });
          }
        } catch (_) { /* best effort */ }
      }

      broadcastConnectionCount(io);
    });
  });
}

async function broadcastConnectionCount(io) {
  const sockets = await io.fetchSockets();
  io.to('admins').emit('CONNECTION_COUNT', { count: sockets.length });
}

module.exports = { setupSocket };
