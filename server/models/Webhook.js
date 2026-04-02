const mongoose = require('mongoose');

const SUPPORTED_EVENTS = [
  'timer.started',
  'timer.stopped',
  'goal.reached',
  'streak.incremented',
  'streak.broken',
  'friend_request.received',
];

const webhookSchema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  url: { type: String, required: true, maxlength: 2048 },
  events: {
    type: [String],
    enum: SUPPORTED_EVENTS,
    required: true,
    validate: { validator: (v) => v.length > 0, message: 'At least one event is required' },
  },
  enabled: { type: Boolean, default: true },
  // HMAC-SHA256 signing secret — stored in plaintext because it must be used
  // server-side to sign every outgoing payload. Shown once at creation and never again.
  secret: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

webhookSchema.statics.SUPPORTED_EVENTS = SUPPORTED_EVENTS;

module.exports = mongoose.model('Webhook', webhookSchema);
