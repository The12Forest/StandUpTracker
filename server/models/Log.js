const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  level: { type: String, enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'], default: 'INFO', index: true },
  message: { type: String, required: true },
  source: String,
  userId: String,
  meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// TTL index: auto-delete logs older than 90 days by default
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Log', logSchema);
