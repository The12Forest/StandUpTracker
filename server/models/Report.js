const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true, index: true },
  targetUserId: { type: String, required: true, index: true },
  // Identifies the specific timer session (timerStartedAt ISO string on target user)
  sessionId: { type: String, required: true },
  reason: { type: String, maxlength: 200, default: '' },
  status: { type: String, enum: ['pending', 'confirmed', 'dismissed'], default: 'pending' },
  date: { type: String, required: true }, // YYYY-MM-DD when the report was filed
}, { timestamps: true });

// One report per reporter per session
reportSchema.index({ reporterId: 1, targetUserId: 1, sessionId: 1 }, { unique: true });
// Efficiently count reports against a session
reportSchema.index({ targetUserId: 1, sessionId: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);
