# server/routes/auth.js

## File Overview

**File path:** `server/routes/auth.js`

Implements all authentication endpoints: registration, login (with TOTP and email 2FA), email verification, logout, session management, password change, profile update, email change, TOTP setup/enable/disable, email 2FA enable/disable, and the `/me` endpoint. Rate limiting is applied to login and registration. All sessions are database-backed.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`)
- `../middleware/guards` (`impersonationGuard`, `softBanCheck`, `lastActiveTouch`)
- `../models/User`, `../models/Session`, `../models/AuditLog`
- `../utils/email` (`sendVerificationEmail`, `send2faCode`)
- `../utils/totp`
- `../utils/logger`
- `../utils/settings` (`getAppConfig`, `getSetting`)

**Dependencies (external):**
- `express`, `argon2`, `crypto`, `qrcode`, `express-rate-limit`

**Side effects when loaded:** Creates the `authLimiter` rate limiter instance.

---

## Variables & Constants

| Name | Type | Description |
|---|---|---|
| `authLimiter` | `RateLimit` | Limits login/register to 20 requests per 15-minute window per IP |

---

## Functions & Methods

### `createSession(res, user, req, options)` (async, exported)

**Signature:** `async function createSession(res, user, req, { isImpersonation?, impersonatorUserId?, impersonatorRole? }?): Promise<string>`

**Description:** Creates a database `Session` document and sets the `sut_session` HttpOnly cookie. For regular sessions, the timeout is read from `sessionTimeoutDays` (1-365 days). For impersonation sessions, the timeout is fixed at 30 minutes.

**Returns:** The `sessionId` string (used as the socket auth token and for backward compatibility).

**Called by:** Login handler, register handler (super_admin path), onboarding route, admin impersonation route.

---

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | Public, rate-limited | Create user account; send verification email |
| `POST` | `/login` | Public, rate-limited | Authenticate; handle TOTP/email 2FA challenges |
| `GET` | `/verify-email` | Public | Confirm email via token |
| `POST` | `/resend-verification` | Public | Resend the verification email |
| `POST` | `/logout` | auth | Delete session and clear cookie |
| `GET` | `/me` | auth | Return current user profile + fresh session token |
| `PUT` | `/profile` | auth | Update theme, daily goal, geminiOptIn |
| `PUT` | `/profile/username` | auth, impersonationGuard | Change username (subject to `allowUsernameChanges` setting) |
| `PUT` | `/password` | auth, impersonationGuard | Change password (requires current password) |
| `POST` | `/email-change/request` | auth, impersonationGuard | Request email change (sends confirmation to new address) |
| `GET` | `/email-change/confirm` | Public | Confirm email change via token |
| `GET` | `/sessions` | auth | List all active sessions for current user |
| `DELETE` | `/sessions/:sessionId` | auth | Revoke a specific session |
| `POST` | `/2fa/totp/setup` | auth, impersonationGuard | Generate TOTP secret and QR code URI |
| `POST` | `/2fa/totp/enable` | auth, impersonationGuard | Enable TOTP with a verification code |
| `POST` | `/2fa/totp/disable` | auth, impersonationGuard | Disable TOTP (requires password) |
| `POST` | `/2fa/email/enable` | auth, impersonationGuard | Enable email 2FA |
| `POST` | `/2fa/email/disable` | auth, impersonationGuard | Disable email 2FA |

---

## Known Issues & Technical Debt

- The `authLimiter` is keyed by IP address. Behind a reverse proxy, all traffic may appear to come from the same IP unless `trust proxy` is configured on the Express app.
- The rate limiter does not distinguish between login and registration; a single pool of 20 requests covers both.
- The `GET /me` endpoint returns a fresh session token in the response body for socket auth. This creates a slight information leak since it can be read by XSS, but since the cookie is HttpOnly, this is the intended design trade-off.
