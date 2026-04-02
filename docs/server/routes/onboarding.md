# server/routes/onboarding.js

## File Overview

**File path:** `server/routes/onboarding.js`

Implements the first-launch setup wizard endpoints. An `onboardingGuard` middleware blocks all routes once setup is complete, preventing re-onboarding. Provides a single bulk-setup endpoint that saves all settings and creates the first admin user, plus a standalone SMTP test endpoint.

**Dependencies (internal):**
- `../models/User`, `../models/Settings`, `../models/Session`
- `../utils/settings` (`isSetupComplete`, `invalidateCache`, `getSetting`)
- `../utils/email` (`testSmtpConnection`)
- `../utils/logger`
- `./auth` (`createSession`) — required dynamically inside the route handler

**Dependencies (external):**
- `express`
- `argon2`
- `crypto` (Node built-in)

---

## Functions & Methods

### `onboardingGuard(req, res, next)`

**Signature:** `async function onboardingGuard(req, res, next): void`

**Description:** Router-level middleware applied with `router.use()`. Calls `isSetupComplete()` and returns `403 { error: 'Setup already complete' }` if setup has already been done. On error, calls `next()` (fails open — allows the route to proceed if the check itself throws).

**Side effects:** None (read-only settings check).

**Called by:** Applied to all routes in this file via `router.use(onboardingGuard)`.

---

## Route Summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/complete` | Run full onboarding: save settings, create super_admin user, return session token |
| `POST` | `/test-smtp` | Test an SMTP connection with provided credentials (no persistence) |

---

## Route Details

### `POST /complete`

**Auth:** None (blocked after first run by `onboardingGuard`)

**Body fields:**
- `username`, `email`, `password` — required admin credentials
- `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `smtpFrom` — optional SMTP config
- `appUrl`, `appName`, `serverPort` — optional application config
- `sessionSecure` — optional boolean for secure cookies

**Flow:**
1. Validates username format (`/^[a-zA-Z0-9_]{3,30}$/`), email format, and password length (≥ 8).
2. Counts existing users; returns `403` if any exist (second guard against re-entry).
3. Generates a 64-byte hex JWT secret and saves it to Settings.
4. Saves each provided config value to the Settings collection individually.
5. Hashes the password with Argon2 and creates the User (pre-save hook auto-assigns `super_admin`).
6. Calls `invalidateCache()` to flush the 15-second settings cache.
7. Dynamically `require('./auth').createSession(...)` to create a DB session.
8. Returns `201` with `{ message, token, user }` so the frontend is immediately authenticated.

**Returns:** `{ message, token, user: { userId, username, email, role, emailVerified, theme } }`

### `POST /test-smtp`

**Auth:** None

**Body fields:** `smtpHost` (required), `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`

**Flow:** Calls `testSmtpConnection()` with the provided raw credentials. Does not persist anything.

**Returns:** `{ success: true, message }` on success or `{ success: false, error }` on failure.

---

## Known Issues & Technical Debt

- `onboardingGuard` fails open: if `isSetupComplete()` throws, the middleware calls `next()` instead of returning an error. On DB unavailability this could allow access to setup routes after setup is complete.
- `require('./auth')` is called dynamically inside the route handler to avoid a circular dependency between `auth.js` and `onboarding.js`. This is functional but fragile — a module restructuring could break it.
- `sessionSecure` is saved as a setting here but is read by the session cookie logic elsewhere. There is no immediate validation that the value is appropriate for the deployment environment.
