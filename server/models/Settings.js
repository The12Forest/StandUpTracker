const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  description: String,
}, { timestamps: true });

// Default settings organized by section
const DEFAULTS = {
  // Server Configuration
  serverPort: { value: 3000, description: 'Server listening port', section: 'server' },
  serverProtocol: { value: 'http', description: 'Server protocol (http/https)', section: 'server' },
  appUrl: { value: 'http://localhost:3000', description: 'Public application URL', section: 'server' },
  appName: { value: 'StandUpTracker', description: 'Application display name', section: 'server' },
  maintenanceMode: { value: false, description: 'Enable maintenance mode', section: 'server' },

  // Security / JWT
  jwtSecret: { value: '', description: 'JWT signing secret (auto-generated on first launch if empty)', section: 'security' },
  jwtExpiresIn: { value: '7d', description: 'JWT token expiry duration (e.g. 7d, 24h)', section: 'security' },
  sessionSecure: { value: false, description: 'Use secure flag on session cookies (enable for HTTPS)', section: 'security' },

  // Client / Interface Settings
  maxDailyMinutes: { value: 1440, description: 'Maximum trackable minutes per day', section: 'client' },
  maxSessionDurationMinutes: { value: 480, description: 'Auto-stop timer after this many minutes', section: 'client' },
  defaultTheme: { value: 'dark', description: 'Default theme for new users (dark/light)', section: 'client' },
  defaultDailyGoalMinutes: { value: 60, description: 'Default daily goal for new users (minutes)', section: 'client' },

  // Mail Server Settings
  smtpHost: { value: '', description: 'SMTP server hostname', section: 'mail' },
  smtpPort: { value: 587, description: 'SMTP server port', section: 'mail' },
  smtpSecure: { value: false, description: 'Use TLS/SSL for SMTP', section: 'mail' },
  smtpUser: { value: '', description: 'SMTP authentication username', section: 'mail' },
  smtpPass: { value: '', description: 'SMTP authentication password', section: 'mail' },
  smtpFrom: { value: 'StandUpTracker <noreply@example.com>', description: 'Sender email address', section: 'mail' },

  // Authentication & Security
  registrationEnabled: { value: true, description: 'Allow new user registrations', section: 'auth' },
  requireEmailVerification: { value: true, description: 'Require email verification to login', section: 'auth' },
  impersonationEnabled: { value: true, description: 'Allow super_admin impersonation', section: 'auth' },

  // Social / Features
  friendRequestsEnabled: { value: true, description: 'Enable friend requests and social features', section: 'social' },

  // Group Settings
  groupsEnabled: { value: true, description: 'Enable group creation and invitations', section: 'groups' },
  maxGroupSize: { value: 20, description: 'Maximum number of members per group', section: 'groups' },
  maxGroupsPerUser: { value: 5, description: 'Maximum number of groups a user can belong to', section: 'groups' },

  // Email Admin
  allowForceReverify: { value: true, description: 'Allow admins to force users to re-verify their email', section: 'emailAdmin' },
  reverifyEmailSubject: { value: 'Please re-verify your email address', description: 'Subject line for forced re-verification emails', section: 'emailAdmin' },

  // AI Settings
  ollamaEnabled: { value: false, description: 'Enable AI advisor feature globally', section: 'ai' },
  ollamaEndpoint: { value: 'http://localhost:11434', description: 'Ollama API endpoint URL (e.g. http://localhost:11434)', section: 'ai' },
  ollamaModel: { value: '', description: 'Active Ollama model name for AI features', section: 'ai' },
  defaultAiSystemPrompt: { value: '', description: 'System prompt for AI advisor (applies to all users)', section: 'ai' },
  defaultAiMaxTokens: { value: 500, description: 'Max response tokens for AI advisor (100-2000, applies to all users)', section: 'ai' },

  // Enforcement
  masterDailyGoalMinutes: { value: 60, description: 'Master daily time goal for all users (minutes)', section: 'enforcement' },
  enforceDailyGoal: { value: false, description: 'Lock the daily goal for all users to the master value', section: 'enforcement' },
  enforce2fa: { value: false, description: 'Require all users to enable two-factor authentication', section: 'enforcement' },

  // Logging
  logLevel: { value: 'INFO', description: 'Minimum log level (DEBUG, INFO, WARN, ERROR)', section: 'logging' },
  logRetentionDays: { value: 90, description: 'Days to retain logs before auto-deletion', section: 'logging' },
  debugMode: { value: false, description: 'Enable verbose debug logging (SMTP, auth events, API traces)', section: 'logging' },
};

settingsSchema.statics.getAll = async function () {
  const stored = await this.find({});
  const settings = {};
  // Start with defaults
  for (const [key, def] of Object.entries(DEFAULTS)) {
    settings[key] = { value: def.value, description: def.description, section: def.section || 'general' };
  }
  // Override with stored values
  for (const s of stored) {
    if (settings[s.key]) {
      settings[s.key].value = s.value;
    } else {
      settings[s.key] = { value: s.value, description: s.description || '', section: 'general' };
    }
  }
  return settings;
};

settingsSchema.statics.get = async function (key) {
  const stored = await this.findOne({ key });
  if (stored) return stored.value;
  return DEFAULTS[key]?.value ?? null;
};

settingsSchema.statics.set = async function (key, value) {
  const desc = DEFAULTS[key]?.description || '';
  return this.findOneAndUpdate(
    { key },
    { key, value, description: desc },
    { upsert: true, new: true }
  );
};

settingsSchema.statics.DEFAULTS = DEFAULTS;

module.exports = mongoose.model('Settings', settingsSchema);
