# server/models/Report.js

## File Overview

**File path:** `server/models/Report.js`

Defines the Mongoose model for user-submitted abuse reports against active timer sessions. A report targets a specific user's currently-running session (identified by `timerStartedAt` as an ISO string). When the number of confirmed reports against a session reaches a configurable threshold, the target user's daily progress is cleared automatically.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `Report` model and its indexes.

---

## Classes & Models

### `Report`

**Collection name:** `reports`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `reporterId` | `String` | Yes | — | userId of the user who submitted the report |
| `targetUserId` | `String` | Yes | — | userId of the reported user |
| `sessionId` | `String` | Yes | — | ISO string of `timerStartedAt` identifying the specific session |
| `reason` | `String` | No | `''` | Optional free-text reason (max 200 chars) |
| `status` | `String` (enum) | No | `'pending'` | `'pending'`, `'confirmed'`, or `'dismissed'` |
| `date` | `String` | Yes | — | YYYY-MM-DD date when the report was filed |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `reporterId` | — | Lookup all reports submitted by a user |
| Single | `targetUserId` | — | Lookup all reports against a user |
| Compound | `(reporterId, targetUserId, sessionId)` | unique | One report per reporter per session |
| Compound | `(targetUserId, sessionId, status)` | — | Count reports against a session by status |

---

## Exports

```js
module.exports = mongoose.model('Report', reportSchema);
```

Used by `server/routes/reports.js` and `server/routes/admin.js`.

---

## Known Issues & Technical Debt

- No TTL index. Report records accumulate indefinitely. After a configurable retention period (e.g., 90 days) old reports could be purged.
- The `sessionId` is the ISO string of `timerStartedAt`. If two sessions for the same user happen to start at the same millisecond, they would share a `sessionId`. In practice this is extremely unlikely but is architecturally fragile.
