const mongoose = require('mongoose');

const aiAdviceCacheSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  context: { type: String, default: 'dashboard' },
  advice: { type: String, required: true },
  generatedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

aiAdviceCacheSchema.index({ userId: 1, context: 1 }, { unique: true });
aiAdviceCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AiAdviceCache', aiAdviceCacheSchema);
