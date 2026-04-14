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
  return getCookieValue(req, 'sut_session');
}

/** Extract a named cookie from the raw cookie header */
function getCookieValue(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.split('=').slice(1).join('=') : null;
}

/**
 * Authenticate via database session lookup.
 * Reads session token from cookie/header, validates against Session collection,
 * checks expiry, loads user, updates lastActiveAt (debounced 1 min).
 */
async function authenticate(req, res, next) {
  // Bypass standard cookie/session auth for public v1 API
  // (These routes are protected by authenticateApiKey instead)
  if (req.originalUrl && req.originalUrl.includes('/api/v1/')) {
    return next();
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let session = await Session.findOne({ sessionId: token });

    // If the session is gone or expired, check for impersonator_token to auto-restore admin
    if (!session || session.expiresAt < new Date()) {
      if (session) await Session.deleteOne({ sessionId: token });

      const impersonatorToken = getCookieValue(req, 'impersonator_token');
      if (impersonatorToken) {
        const adminSession = await Session.findOne({ sessionId: impersonatorToken, expiresAt: { $gt: new Date() } });
        if (adminSession) {
          // Auto-restore admin session: swap cookies and signal the client
          const { getAppConfig } = require('../utils/settings');
          const { sessionSecure } = await getAppConfig();
          const remainingMs = adminSession.expiresAt.getTime() - Date.now();
          res.cookie('sut_session', impersonatorToken, {
            httpOnly: true, secure: sessionSecure, sameSite: 'lax', path: '/',
            maxAge: Math.max(remainingMs, 0),
          });
          res.clearCookie('impersonator_token', { httpOnly: true, sameSite: 'strict', path: '/' });
          // Also clear impersonatedBy on the target user if we can find them
          if (session?.isImpersonation && session.userId) {
            User.updateOne({ userId: session.userId }, { $unset: { impersonatedBy: 1 } }).catch(() => {});
          }
          return res.status(401).json({
            error: 'Impersonation session expired. Your admin session has been restored.',
            impersonationExpired: true,
            sessionExpired: true,
          });
        }
        // Admin session also expired — clear both cookies
        res.clearCookie('impersonator_token', { httpOnly: true, sameSite: 'strict', path: '/' });
      }

      res.clearCookie('sut_session', { httpOnly: true, sameSite: 'lax', path: '/' });
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', sessionExpired: true });
    }

    const user = await User.findOne({ userId: session.userId, active: true });
    if (!user) {
      await Session.deleteOne({ sessionId: token });
      res.clearCookie('sut_session', { httpOnly: true, sameSite: 'lax', path: '/' });
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
