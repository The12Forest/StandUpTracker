const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const logger = require('../utils/logger');
const { getJwtSecret } = require('../utils/settings');

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
