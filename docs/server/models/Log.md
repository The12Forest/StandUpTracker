# server/models/Log.js

## File Overview

**File path:** `server/models/Log.js`

Defines the Mongoose model for application log entries. The logger utility (`server/utils/logger.js`) writes structured log entries to this collection. Entries auto-expire after 90 days via a TTL index. The retention period is also controlled by the `logRetentionDays` setting but the TTL index is hardcoded at 90 days and does not dynamically respect that setting.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `Log` model and its indexes.

---

## Classes & Models

### `Log`

**Collection name:** `logs`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `level` | `String` (enum) | No | `'INFO'` | Severity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `message` | `String` | Yes | — | Human-readable log message |
| `source` | `String` | No | — | Module or subsystem that generated the log (e.g., `'auth'`, `'streaks'`) |
| `userId` | `String` | No | — | UUID of the related user, if any |
| `meta` | `Mixed` | No | — | Additional freeform context (error objects, request details, etc.) |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp (used by the TTL index) |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `level` | — | Fast filtering by severity in the admin log viewer |
| TTL | `createdAt` | expireAfterSeconds: 7776000 (90 days) | Auto-delete old entries |

---

## Exports

```js
module.exports = mongoose.model('Log', logSchema);
```

Used exclusively by `server/utils/logger.js`.

---

## Known Issues & Technical Debt

- The TTL index expiry (90 days) is hardcoded in the schema. The `logRetentionDays` setting in the admin console has no effect on the actual TTL. To change the retention period the index must be dropped and recreated manually.
