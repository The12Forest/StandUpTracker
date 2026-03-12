const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Notification = require('../models/Notification');
const TrackingData = require('../models/TrackingData');
const logger = require('../utils/logger');
const { getJwtSecret, getEffectiveGoalMinutes } = require('../utils/settings');

// Global counter state — Single Source of Truth
const counterState = {
  running: false,
  startedBy: null,
  startedAt: null,
};

function setupSocket(io) {
  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const payload = jwt.verify(token, await getJwtSecret());
      const user = await User.findOne({ userId: payload.userId, active: true });
      if (!user) return next(new Error('User not found'));

      socket.user = {
        userId: user.userId,
        username: user.username,
        role: user.role,
      };

      // Track impersonation on socket
      if (payload.imp) {
        socket.user.impersonator = { userId: payload.imp, role: payload.impRole };
      }

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
    if (['admin', 'super_admin'].includes(role)) {
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
        const u = await User.findOne({ userId });
        if (!u || u.timerRunning) return;
        const now = new Date();
        u.timerRunning = true;
        u.timerStartedAt = now;
        await u.save();
        io.to(`user:${userId}`).emit('TIMER_SYNC', {
          running: true,
          startedAt: now.getTime(),
          serverTime: Date.now(),
        });
      } catch (err) {
        logger.warn(`Timer start failed for ${username}: ${err.message}`, { source: 'websocket' });
      }
    });

    // Personal timer stop via socket (cross-device)
    socket.on('TIMER_STOP', async () => {
      try {
        const u = await User.findOne({ userId });
        if (!u || !u.timerRunning) return;
        const startedAt = u.timerStartedAt;
        const now = new Date();
        const sessionMs = now.getTime() - startedAt.getTime();
        const sessionSeconds = Math.min(Math.max(Math.round(sessionMs / 1000), 0), 86400);

        u.timerRunning = false;
        u.timerStartedAt = null;
        await u.save();

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

          // Recalc stats
          const allData = await TrackingData.find({ userId });
          const totalSeconds = allData.reduce((sum, d) => sum + d.seconds, 0);
          const totalDays = allData.filter(d => d.seconds > 180).length;
          const effectiveGoal = await getEffectiveGoalMinutes(u);
          const goalSeconds = effectiveGoal * 60;
          const dataMap = {};
          allData.forEach(d => { dataMap[d.date] = d.seconds; });

          const todayDate = new Date();
          let currentStreak = 0;
          for (let i = 0; i < 3650; i++) {
            const d = new Date(todayDate);
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().slice(0, 10);
            if ((dataMap[ds] || 0) >= goalSeconds) currentStreak++;
            else break;
          }

          let bestStreak = 0, run = 0;
          const sorted = allData.map(d => d.date).sort();
          if (sorted.length > 0) {
            const first = new Date(sorted[0] + 'T00:00:00');
            const last = new Date(sorted[sorted.length - 1] + 'T00:00:00');
            for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
              const ds = d.toISOString().slice(0, 10);
              if ((dataMap[ds] || 0) >= goalSeconds) { run++; bestStreak = Math.max(bestStreak, run); }
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
          const goalReachedNow = todayTotalSeconds >= goalSeconds && previousTotalSeconds < goalSeconds;

          await User.updateOne({ userId }, { totalStandingSeconds: totalSeconds, totalDays, currentStreak, bestStreak, level });

          io.to(`user:${userId}`).emit('STATS_UPDATE', {
            totalStandingSeconds: totalSeconds, totalDays, currentStreak, bestStreak, level,
            todaySeconds: todayTotalSeconds,
          });

          // Level up notification
          if (level > oldLevel) {
            const titles = ['', 'Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal'];
            const notif = await Notification.create({
              userId, type: 'level_up', title: 'Level Up!',
              message: `You reached Level ${level} — ${titles[level] || 'Master'}!`,
              data: { level },
            });
            io.to(`user:${userId}`).emit('NOTIFICATION', notif.toObject());
          }

          // Goal reached notification
          if (goalReachedNow) {
            const notif = await Notification.create({
              userId, type: 'daily_goal_reached', title: 'Daily Goal Reached!',
              message: `You hit your ${effectiveGoal}-minute daily goal. Great work!`,
              data: { minutes: effectiveGoal },
            });
            io.to(`user:${userId}`).emit('NOTIFICATION', notif.toObject());
          }
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
