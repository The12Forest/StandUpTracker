const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  keyId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  // SHA-256 hex of the raw key — fast lookup without storing plaintext
  keyHash: { type: String, required: true, unique: true, index: true },
  // First 8 chars of the raw key for display identification only
  prefix: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null },
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
