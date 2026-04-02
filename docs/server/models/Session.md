# server/models/Session.js

## File Overview

**File path:** `server/models/Session.js`

Defines the Mongoose model for database-backed authentication sessions. When a user logs in, a session document is created with a cryptographically secure `sessionId`. This ID is stored in an HttpOnly cookie (`sut_session`) and sent as a Bearer token for socket authentication. MongoDB's TTL index automatically expires sessions at `expiresAt`. A static `generateSessionId()` method generates secure random session IDs.

**Dependencies (external):**
- `mongoose`
- `crypto` (Node built-in)

**Side effects when loaded:** Registers the `Session` model and its indexes.

---

## Classes & Models

### `Session`

**Collection name:** `sessions`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `sessionId` | `String` | Yes | — | 96-character hex string (48 random bytes), used as the cookie/token value |
| `userId` | `String` | Yes | — | UUID of the authenticated user |
| `createdAt` | `Date` | No | `Date.now` | Session creation time |
| `lastActiveAt` | `Date` | No | `Date.now` | Last time the session was used (updated by `authenticate` middleware) |
| `expiresAt` | `Date` | Yes | — | Absolute expiry; TTL index deletes the document at this time |
| `userAgent` | `String` | No | `''` | Browser user-agent recorded at login |
| `isImpersonation` | `Boolean` | No | `false` | True if this session was created by admin impersonation |
| `impersonatorUserId` | `String` | No | `null` | userId of the admin who initiated impersonation |
| `impersonatorRole` | `String` | No | `null` | Role of the impersonating admin |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Unique | `sessionId` | unique | Primary lookup key |
| Single | `userId` | — | Find all sessions for a user |
| Single | `expiresAt` | — | Used by TTL index and expiry queries |
| TTL | `expiresAt` | expireAfterSeconds: 0 | MongoDB auto-deletes expired sessions |

---

## Static Methods

### `Session.generateSessionId()`

**Signature:** `static generateSessionId(): string`

**Description:** Generates a cryptographically secure 48-byte random value encoded as a 96-character lowercase hex string. Used by `server/routes/auth.js` when creating new sessions.

**Returns:** `string` — 96-character hex session ID.

---

## Exports

```js
module.exports = mongoose.model('Session', sessionSchema);
```

Used by `server/routes/auth.js` (create/delete sessions), `server/middleware/auth.js` (validate sessions), and `server/middleware/guards.js` (maintenance gate bypass).

---

## Known Issues & Technical Debt

- The hourly cleanup `setInterval` in `server/index.js` that deletes expired sessions is redundant with the MongoDB TTL index. It provides faster cleanup but adds unnecessary DB traffic. One mechanism is sufficient.
