const Settings = require('../models/Settings');

// Cache maintenance mode to avoid DB spam
let maintenanceCache = { value: false, fetchedAt: 0 };
const CACHE_TTL = 30_000;

async function maintenanceGate(req, res, next) {
  // Always allow auth endpoints (login, verify, me) so admins can authenticate
  if (req.path.startsWith('/auth/')) return next();

  const now = Date.now();
  if (now - maintenanceCache.fetchedAt > CACHE_TTL) {
    maintenanceCache.value = await Settings.get('maintenanceMode') || false;
    maintenanceCache.fetchedAt = now;
  }
  if (maintenanceCache.value) {
    // Allow super_admin through
    if (req.user && req.user.role === 'super_admin') return next();
    return res.status(503).json({ error: 'System under maintenance' });
  }
  next();
}

function softBanCheck(req, res, next) {
  if (req.user && req.user.blockedUntil && new Date(req.user.blockedUntil) > new Date()) {
    return res.status(403).json({
      error: 'Account temporarily suspended',
      until: req.user.blockedUntil,
    });
  }
  next();
}

function impersonationGuard(req, res, next) {
  if (req.impersonator) {
    return res.status(403).json({ error: 'Action not permitted during impersonation' });
  }
  next();
}

function currentDayGuard(req, res, next) {
  const { date } = req.body;
  if (!date) return next();
  const today = new Date().toISOString().slice(0, 10);
  if (date !== today && !['admin', 'super_admin', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Users can only edit current-day recordings' });
  }
  next();
}

// Debounced last-active touch (max once per 5 min per user)
const lastTouched = new Map();
function lastActiveTouch(req, res, next) {
  if (!req.user) return next();
  const now = Date.now();
  const last = lastTouched.get(req.user.userId) || 0;
  if (now - last > 5 * 60 * 1000) {
    lastTouched.set(req.user.userId, now);
    req.user.lastActiveAt = new Date();
    req.user.save().catch(() => {});
  }
  next();
}

function aiGateCheck(req, res, next) {
  Settings.get('ollamaEnabled').then(enabled => {
    if (!enabled) {
      return res.status(403).json({ error: 'AI features are disabled' });
    }
    if (!req.user.geminiOptIn) {
      return res.status(403).json({ error: 'Please enable AI features in Settings' });
    }
    next();
  }).catch(() => res.status(500).json({ error: 'Failed to check AI settings' }));
}

module.exports = {
  maintenanceGate,
  softBanCheck,
  impersonationGuard,
  currentDayGuard,
  lastActiveTouch,
  aiGateCheck,
};
