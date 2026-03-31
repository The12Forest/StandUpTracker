const mongoose = require('mongoose');
const crypto = require('crypto');

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  userAgent: { type: String, default: '' },
  isImpersonation: { type: Boolean, default: false },
  impersonatorUserId: { type: String, default: null },
  impersonatorRole: { type: String, default: null },
});

// TTL index: MongoDB auto-deletes documents 0 seconds after expiresAt
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Generate a cryptographically secure session ID.
 */
sessionSchema.statics.generateSessionId = function () {
  return crypto.randomBytes(48).toString('hex');
};

module.exports = mongoose.model('Session', sessionSchema);
