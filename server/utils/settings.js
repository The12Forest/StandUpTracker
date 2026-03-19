const crypto = require('crypto');
const Settings = require('../models/Settings');

// In-memory cache for frequently accessed settings
let _cache = {};
let _cacheTime = 0;
const CACHE_TTL = 15_000; // 15 seconds

async function refreshCache() {
  const now = Date.now();
  if (now - _cacheTime < CACHE_TTL && Object.keys(_cache).length > 0) return;
  try {
    const all = await Settings.getAll();
    const flat = {};
    for (const [key, meta] of Object.entries(all)) {
      flat[key] = meta.value;
    }
    _cache = flat;
    _cacheTime = now;
  } catch {
    // If DB not ready yet, keep stale cache
  }
}

function invalidateCache() {
  _cacheTime = 0;
}

async function getSetting(key) {
  await refreshCache();
  if (_cache[key] !== undefined) return _cache[key];
  // Fallback to direct DB read
  return Settings.get(key);
}

async function getJwtSecret() {
  let secret = await getSetting('jwtSecret');
  if (!secret) {
    // Auto-generate a secure random secret on first use
    secret = crypto.randomBytes(64).toString('hex');
    await Settings.set('jwtSecret', secret);
    invalidateCache();
  }
  return secret;
}

async function getJwtExpiresIn() {
  return (await getSetting('jwtExpiresIn')) || '7d';
}

async function getSmtpConfig() {
  await refreshCache();
  return {
    host: _cache.smtpHost || '',
    port: parseInt(_cache.smtpPort, 10) || 587,
    secure: !!_cache.smtpSecure,
    user: _cache.smtpUser || '',
    pass: _cache.smtpPass || '',
    from: _cache.smtpFrom || 'StandUpTracker <noreply@example.com>',
  };
}

async function getAppConfig() {
  await refreshCache();
  return {
    appUrl: _cache.appUrl || 'http://localhost:3000',
    appName: _cache.appName || 'StandUpTracker',
    port: parseInt(_cache.serverPort, 10) || 3000,
    sessionSecure: !!_cache.sessionSecure,
  };
}

async function isSetupComplete() {
  try {
    const User = require('../models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0) return false;
    const jwtSecret = await Settings.get('jwtSecret');
    return !!jwtSecret;
  } catch {
    return false;
  }
}

/**
 * Single source of truth for a user's effective daily goal.
 * Priority: 1) Per-day override → 2) Admin enforcement → 3) User preference → 4) Default
 */
async function getEffectiveGoalMinutes(user, date) {
  // Per-day override takes highest priority (set by admins per user per date)
  if (date) {
    const DailyGoalOverride = require('../models/DailyGoalOverride');
    const uid = typeof user === 'string' ? user : user.userId;
    const override = await DailyGoalOverride.findOne({ userId: uid, date });
    if (override) return override.goalMinutes;
  }

  // Admin enforcement of master goal
  const enforced = await getSetting('enforceDailyGoal');
  if (enforced) {
    const masterGoal = await getSetting('masterDailyGoalMinutes');
    return masterGoal || 60;
  }

  // User preference
  if (typeof user === 'string') {
    const User = require('../models/User');
    const userDoc = await User.findOne({ userId: user });
    return userDoc?.dailyGoalMinutes || 60;
  }
  return user.dailyGoalMinutes || 60;
}

/**
 * Check if a specific date is marked as an off day for a user.
 * Off days are excluded from streak calculations entirely.
 */
async function isOffDay(userId, date) {
  const OffDay = require('../models/OffDay');
  const uid = typeof userId === 'string' ? userId : userId.userId;
  const doc = await OffDay.findOne({ userId: uid, date });
  return !!doc;
}

/**
 * Check if a day's activity meets the minimum threshold for statistics inclusion.
 * Days below the threshold are excluded from all stats (active days, heatmap, etc.).
 * Does NOT affect streak calculations.
 */
async function isDayCountedInStats(totalSeconds, _date) {
  const threshold = await getSetting('minActivityThresholdMinutes');
  const minSeconds = (threshold || 1) * 60;
  return totalSeconds >= minSeconds;
}

/**
 * Get the minimum activity threshold in seconds.
 */
async function getMinActivityThresholdSeconds() {
  const threshold = await getSetting('minActivityThresholdMinutes');
  return (threshold || 1) * 60;
}

module.exports = {
  getSetting,
  getJwtSecret,
  getJwtExpiresIn,
  getSmtpConfig,
  getAppConfig,
  isSetupComplete,
  invalidateCache,
  getEffectiveGoalMinutes,
  isOffDay,
  isDayCountedInStats,
  getMinActivityThresholdSeconds,
};
