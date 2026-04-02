# server/models/AuditLog.js

## File Overview

**File path:** `server/models/AuditLog.js`

This file defines the Mongoose model for immutable audit log entries. Audit logs record sensitive administrative actions (role changes, impersonation, data edits, settings changes, etc.) for compliance and accountability purposes. Entries auto-delete after 365 days via a MongoDB TTL index.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `AuditLog` model and creates its indexes.

---

## Classes & Models

### `AuditLog`

**Collection name:** `auditlogs`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `actorId` | `String` | Yes | — | userId of the admin who performed the action |
| `actorRole` | `String` | No | — | Role of the acting admin at time of action |
| `targetId` | `String` | No | — | userId of the affected user (if applicable) |
| `action` | `String` (enum) | Yes | — | Type of action performed (see enum below) |
| `details` | `Mixed` | No | — | Freeform JSON payload with before/after state |
| `ip` | `String` | No | — | IP address of the request |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp (used by TTL index) |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Allowed `action` values:**
`impersonate_start`, `impersonate_end`, `role_change`, `bulk_deactivate`, `bulk_activate`, `bulk_delete`, `bulk_setRole`, `data_edit`, `data_delete`, `data_override_reset`, `setting_change`, `friendship_block_admin`, `admin_verify_email`, `admin_set_password`, `admin_delete_user`, `admin_block_user`, `force_reverify`, `onboarding_complete`, `daily_goal_override`, `daily_goal_override_clear`, `off_day_set`, `off_day_clear`, `vapid_keys_regenerated`

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `actorId` | — | Query logs by actor |
| Single | `targetId` | — | Query logs by affected user |
| Single | `action` | — | Filter by action type |
| TTL | `createdAt` | expireAfterSeconds: 31536000 (365 days) | Auto-deletes old entries |

---

## Exports

```js
module.exports = mongoose.model('AuditLog', auditLogSchema);
```

Used by `server/routes/admin.js` to record administrative actions.

---

## Known Issues & Technical Debt

- The `details` field is `Mixed` type with no schema validation. Inconsistent shapes across action types make programmatic analysis of audit logs difficult.
- There is no index on `createdAt` for range queries from the admin UI, which may be slow on large collections. The TTL index does exist on `createdAt` but is used only for deletion.
