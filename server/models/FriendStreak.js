const mongoose = require('mongoose');

const friendStreakSchema = new mongoose.Schema({
  userA: { type: String, required: true },
  userB: { type: String, required: true },
  currentStreak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  lastSyncDate: String,
}, { timestamps: true });

friendStreakSchema.index({ userA: 1, userB: 1 }, { unique: true });

module.exports = mongoose.model('FriendStreak', friendStreakSchema);
