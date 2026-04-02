# server/middleware/auth.js

## File Overview

**File path:** `server/middleware/auth.js`

This file provides the three core authentication and authorization middleware functions used throughout the Express route chain. Authentication is entirely session-based: the session token is looked up in the `Session` MongoDB collection on every request. JWT tokens are no longer used for request authentication.

**Dependencies (internal):**
- `../models/User`
- `../models/Session`

**Side effects when loaded:** None. Exports functions only.

---

## Variables & Constants

None at module scope.

---

## Functions & Methods

### `getTokenFromRequest(req)`

**Signature:** `function getTokenFromRequest(req: express.Request): string | null`

**Parameters:**
- `req` — Express request object

**Returns:** The session token string, or `null` if none is found.

**Description:** Extracts the session token from two sources with the following priority:
1. `Authorization` header with `Bearer ` prefix.
2. `sut_session` HttpOnly cookie parsed from the raw `Cookie` header.

**Side effects:** None.

**Called by:** `authenticate`, `maintenanceGate` (guards.js)

---

### `authenticate(req, res, next)` (async middleware)

**Signature:** `async function authenticate(req, res, next)`

**Description:** The primary authentication middleware. Extracts the session token, validates it against the `Session` collection, checks expiry, loads the corresponding `User` document, and attaches both to the request as `req.user` and `req.sessionDoc`. Populates `req.impersonator` if the session is an impersonation session.

**Side effects:**
- Calls `Session.updateOne` to update `lastActiveAt` if more than 60 seconds have passed since the last update (debounced in-DB write).
- Clears the `sut_session` cookie and deletes the session document if the token is invalid or expired.

**Response on failure:**
- `401 { error: 'Authentication required' }` — no token present.
- `401 { error: 'Invalid or expired session', sessionExpired: true }` — session not found in DB.
- `401 { error: 'Your session has expired. Please log in again.', sessionExpired: true }` — session found but `expiresAt` is in the past.
- `401 { error: 'User not found or deactivated' }` — session valid but user is missing or `active: false`.

---

### `requireRole(...roles)` (middleware factory)

**Signature:** `function requireRole(...roles: string[]): express.RequestHandler`

**Parameters:**
- `...roles` — One or more role strings (`'user'`, `'moderator'`, `'admin'`, `'super_admin'`).

**Returns:** An Express middleware that responds `403` if `req.user.role` is not in the provided list.

**Called by:** Various admin and AI route handlers.

---

### `requireVerified(req, res, next)` (middleware)

**Signature:** `function requireVerified(req, res, next)`

**Description:** Blocks requests from users whose email is not verified. Must be used after `authenticate`.

**Response on failure:** `403 { error: 'Email verification required' }`

---

## Exports

```js
module.exports = { authenticate, requireRole, requireVerified, getTokenFromRequest };
```

---

## Known Issues & Technical Debt

- The cookie parsing in `getTokenFromRequest` uses a simple string split that will fail to decode URL-encoded characters. Standard `cookie` parsers handle this correctly. However, since the session ID is a hex string, this is not a practical issue.
- `authenticate` makes two separate DB queries (Session lookup + User lookup) on every authenticated request. An index on `Session.sessionId` and `User.userId` mitigates this, but it is still two round trips per request.
