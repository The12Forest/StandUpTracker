const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/settings');

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

async function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const secret = await getJwtSecret();
    const payload = jwt.verify(token, secret);
    const user = await User.findOne({ userId: payload.userId, active: true });
    if (!user) return res.status(401).json({ error: 'User not found or deactivated' });
    req.user = user;

    if (payload.imp) {
      req.impersonator = { userId: payload.imp, role: payload.impRole };
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
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

module.exports = { authenticate, requireRole, requireVerified };
