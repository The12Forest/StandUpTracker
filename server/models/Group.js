const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const memberSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  role: { type: String, enum: ['owner', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const inviteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  invitedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const groupSchema = new mongoose.Schema({
  groupId: { type: String, default: () => uuidv4(), unique: true },
  name: { type: String, required: true, trim: true, maxlength: 50 },
  members: [memberSchema],
  invites: [inviteSchema],
  // Group streak
  currentStreak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  lastSyncDate: String, // YYYY-MM-DD
}, { timestamps: true });

groupSchema.index({ 'members.userId': 1 });
groupSchema.index({ 'invites.userId': 1 });

module.exports = mongoose.model('Group', groupSchema);
