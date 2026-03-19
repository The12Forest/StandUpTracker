const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true, index: true },
  actorRole: String,
  targetId: { type: String, index: true },
  action: {
    type: String,
    enum: [
      'impersonate_start', 'impersonate_end', 'role_change',
      'bulk_deactivate', 'bulk_activate', 'bulk_delete', 'bulk_setRole',
      'data_edit', 'data_delete', 'data_override_reset', 'setting_change', 'friendship_block_admin',
      'admin_verify_email', 'admin_set_password', 'admin_delete_user', 'admin_block_user',
      'force_reverify', 'onboarding_complete',
      'daily_goal_override', 'daily_goal_override_clear',
      'off_day_set', 'off_day_clear',
    ],
    required: true,
    index: true,
  },
  details: mongoose.Schema.Types.Mixed,
  ip: String,
}, { timestamps: true });

auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
