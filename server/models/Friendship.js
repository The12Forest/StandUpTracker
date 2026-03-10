const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  requester: { type: String, required: true, index: true },
  recipient: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
  acceptedAt: Date,
}, { timestamps: true });

friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ recipient: 1, status: 1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
