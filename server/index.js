const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const leaderboardRoutes = require('./routes/leaderboard');
const socialRoutes = require('./routes/social');
const groupRoutes = require('./routes/groups');
const aiRoutes = require('./routes/ai');
const notificationRoutes = require('./routes/notifications');
const onboardingRoutes = require('./routes/onboarding');
const reportRoutes = require('./routes/reports');
const schedulerRoutes = require('./routes/scheduler');
const publicApiRoutes = require('./routes/publicApi');
const { maintenanceGate } = require('./middleware/guards');
const { setupSocket } = require('./socket/handler');
const { startupStreakIntegrityCheck, scheduleMidnightJob } = require('./utils/streaks');
const { runNotificationScheduler } = require('./utils/notifications');
const { isSetupComplete, getSetting } = require('./utils/settings');
const Session = require('./models/Session');

const fs = require('fs');

const app = express();
const server = http.createServer(app);
// CORS origin is configured after DB connects (set on app for socket use)
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      const allowed = app.get('corsOrigin') || '*';
      if (allowed === '*' || !origin || origin === allowed) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => {
    const allowed = app.get('corsOrigin') || '*';
    if (allowed === '*' || !origin || origin === allowed) cb(null, true);
    else cb(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Determine which frontend to serve
const reactDist = path.join(__dirname, '..', 'frontend', 'dist');
const legacyPublic = path.join(__dirname, '..', 'public');
const staticDir = fs.existsSync(reactDist) ? reactDist : legacyPublic;

// Static files
app.use(express.static(staticDir));

// Setup status endpoint (public, needed by frontend before auth)
app.get('/api/setup/status', async (req, res) => {
  try {
    const complete = await isSetupComplete();
    res.json({ setupComplete: complete });
  } catch {
    res.json({ setupComplete: false });
  }
});

// Onboarding routes (only work when setup is not complete)
app.use('/api/setup', onboardingRoutes);

// Setup gate — block all API routes except /api/setup and /api/auth when setup is incomplete
app.use('/api', async (req, res, next) => {
  if (req.path.startsWith('/setup')) return next();
  try {
    const complete = await isSetupComplete();
    if (!complete) {
      return res.status(503).json({ error: 'Setup not complete', setupRequired: true });
    }
  } catch {
    // If DB isn't ready, let it pass to get a proper error downstream
  }
  next();
});

// Maintenance gate — blocks non-super_admin traffic when maintenance mode is on
app.use('/api', maintenanceGate);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/v1', publicApiRoutes);

// SPA fallback — serve index.html for all client routes
const spaPages = ['/app', '/login', '/register', '/admin', '/admin/*', '/leaderboard', '/settings', '/dashboard', '/friends', '/groups', '/streaks', '/scheduler', '/setup', '/2fa-setup'];
spaPages.forEach(route => {
  app.get(route, (req, res) => {
    if (fs.existsSync(reactDist)) {
      res.sendFile(path.join(reactDist, 'index.html'));
    } else {
      const page = route === '/' ? 'index' : route.slice(1);
      const file = path.join(legacyPublic, `${page}.html`);
      res.sendFile(fs.existsSync(file) ? file : path.join(legacyPublic, 'index.html'));
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: process.env.APP_VERSION || 'dev' });
});

// WebSocket
setupSocket(io);

// Store io on app for route access
app.set('io', io);

// Connect to MongoDB and start server
async function start() {
  let uri = config.mongoUri;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    console.log('Primary MongoDB unreachable, trying in-memory server...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log('Using in-memory MongoDB at', uri);
    } catch (e) {
      logger.error('MongoDB connection failed', { meta: { error: e.message } });
      process.exit(1);
    }
  }
  logger.info('MongoDB connected');

  // Set CORS origin from DB settings (appUrl)
  try {
    const appUrlSetting = await getSetting('appUrl');
    if (appUrlSetting) app.set('corsOrigin', appUrlSetting);
  } catch { /* use wildcard fallback */ }

  // Startup streak integrity check — backfills goalMet, corrects inconsistent streaks
  startupStreakIntegrityCheck(io).catch(err => {
    logger.error(`Startup streak integrity check failed: ${err.message}`, { source: 'startup' });
  });

  // Midnight streak rollover job — breaks streaks for missed goals, increments friend/group streaks
  scheduleMidnightJob(io);

  // Notification scheduler — runs every hour
  setInterval(() => { runNotificationScheduler(io).catch(() => {}); }, 60 * 60 * 1000);

  // Session cleanup — delete expired sessions every hour
  // (MongoDB TTL index also handles this, but this ensures prompt cleanup)
  setInterval(() => {
    Session.deleteMany({ expiresAt: { $lt: new Date() } }).catch(() => {});
  }, 60 * 60 * 1000);

  // Read port from DB settings, fallback to 3000
  let port = 3000;
  try {
    const dbPort = await getSetting('serverPort');
    if (dbPort) port = parseInt(dbPort, 10) || 3000;
  } catch { /* DB may not have settings yet on first launch */ }

  server.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    console.log(`Server running on http://localhost:${port}`);
  });
}
start();

module.exports = { app, io };
