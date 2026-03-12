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

async function getEffectiveGoalMinutes(user) {
  const enforced = await getSetting('enforceDailyGoal');
  if (enforced) {
    const masterGoal = await getSetting('masterDailyGoalMinutes');
    return masterGoal || 60;
  }
  return user.dailyGoalMinutes;
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
};
