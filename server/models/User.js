const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  userId: { type: String, default: () => uuidv4(), unique: true, index: true },
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'], default: 'user' },
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: String,
  emailVerifyExpires: Date,
  // 2FA - TOTP
  totpEnabled: { type: Boolean, default: false },
  totpSecret: String,
  totpRecoveryCodes: [String],
  // 2FA - Email
  email2faEnabled: { type: Boolean, default: false },
  email2faCode: String,
  email2faExpires: Date,
  // Pending email change
  pendingEmail: String,
  pendingEmailToken: String,
  pendingEmailExpires: Date,
  // Settings
  theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
  dailyGoalMinutes: { type: Number, default: 60 },
  active: { type: Boolean, default: true },
  // Zenith Pro fields
  impersonatedBy: String,
  lastActiveAt: Date,
  blockedUntil: Date,
  geminiOptIn: { type: Boolean, default: false },
  // Push notification preferences
  pushEnabled: { type: Boolean, default: false },
  pushPreferences: {
    standup_reminder: { type: Boolean, default: true },
    streak_at_risk: { type: Boolean, default: true },
    friend_request: { type: Boolean, default: true },
    level_up: { type: Boolean, default: true },
    daily_goal_reached: { type: Boolean, default: true },
  },
  standupReminderTime: { type: String, default: '12:00' }, // HH:MM in UTC
  // Active timer (server-authoritative)
  timerRunning: { type: Boolean, default: false },
  timerStartedAt: { type: Date, default: null },
  // Stats
  totalStandingSeconds: { type: Number, default: 0 },
  totalDays: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
}, { timestamps: true });

// Pre-save hook: first user becomes super_admin
userSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('User').countDocuments();
    if (count === 0) {
      this.role = 'super_admin';
      this.emailVerified = true;
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
