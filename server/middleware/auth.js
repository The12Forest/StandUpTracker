const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const ApiKey = require('../models/ApiKey');

/**
 * Extract session token from request.
 * Priority: 1) Bearer header  2) sut_session cookie
 */
function getTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('sut_session='));
    if (match) return match.split('=').slice(1).join('=');
  }
  return null;
}

/**
 * Authenticate via database session lookup.
 * Reads session token from cookie/header, validates against Session collection,
 * checks expiry, loads user, updates lastActiveAt (debounced 1 min).
 */
async function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const session = await Session.findOne({ sessionId: token });
    if (!session) {
      res.clearCookie('sut_session', { path: '/' });
      return res.status(401).json({ error: 'Invalid or expired session', sessionExpired: true });
    }

    if (session.expiresAt < new Date()) {
      await Session.deleteOne({ sessionId: token });
      res.clearCookie('sut_session', { path: '/' });
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', sessionExpired: true });
    }

    const user = await User.findOne({ userId: session.userId, active: true });
    if (!user) {
      await Session.deleteOne({ sessionId: token });
      res.clearCookie('sut_session', { path: '/' });
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    req.user = user;
    req.sessionDoc = session;

    // Populate impersonation info
    if (session.isImpersonation && session.impersonatorUserId) {
      req.impersonator = { userId: session.impersonatorUserId, role: session.impersonatorRole };
    }

    // Debounced lastActiveAt update (max once per minute to reduce DB writes)
    const now = new Date();
    if (now - session.lastActiveAt > 60_000) {
      Session.updateOne({ sessionId: token }, { $set: { lastActiveAt: now } }).catch(() => {});
    }

    next();
  } catch (err) {
    // DB/network error — don't treat as auth failure; return 503 so the client can retry
    return res.status(503).json({ error: 'Service temporarily unavailable, please retry' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function requireVerified(req, res, next) {
  if (!req.user.emailVerified) {
    return res.status(403).json({ error: 'Email verification required' });
  }
  next();
}

/**
 * Authenticate an API key from Authorization: Bearer header or ?api_key= query param.
 * Sets req.user and req.apiKey on success.
 */
async function authenticateApiKey(req, res, next) {
  let rawKey = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) rawKey = header.slice(7);
  if (!rawKey && req.query.api_key) rawKey = req.query.api_key;
  if (!rawKey) return res.status(401).json({ error: 'API key required' });

  try {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await ApiKey.findOne({ keyHash });
    if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });

    const user = await User.findOne({ userId: apiKey.userId, active: true });
    if (!user) return res.status(401).json({ error: 'User not found or deactivated' });

    req.user = user;
    req.apiKey = apiKey;

    // Update lastUsedAt asynchronously (best-effort, don't block the request)
    ApiKey.updateOne({ keyId: apiKey.keyId }, { lastUsedAt: new Date() }).catch(() => {});

    next();
  } catch (err) {
    return res.status(503).json({ error: 'Service temporarily unavailable, please retry' });
  }
}

module.exports = { authenticate, requireRole, requireVerified, getTokenFromRequest, authenticateApiKey };
