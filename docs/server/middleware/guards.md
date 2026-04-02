# server/middleware/guards.js

## File Overview

**File path:** `server/middleware/guards.js`

This file exports five Express middleware functions that enforce system-level access policies beyond basic authentication. These guards are composed into route chains alongside `authenticate` and `requireVerified` from `auth.js`.

**Dependencies (internal):**
- `../models/Settings`
- `../models/Session`
- `../models/User`

**Side effects when loaded:**
- Initializes module-level mutable state: `maintenanceCache` object and `lastTouched` Map.

---

## Variables & Constants

| Name | Type | Initial Value | Description |
|---|---|---|---|
| `maintenanceCache` | `object` | `{ value: false, fetchedAt: 0 }` | In-memory cache for the `maintenanceMode` setting to avoid per-request DB reads |
| `CACHE_TTL` | `number` | `30_000` (30 seconds) | How long the maintenance mode value is cached before re-reading from the DB |
| `lastTouched` | `Map<string, number>` | Empty | Maps `userId` to a timestamp; used to debounce `lastActiveAt` updates |

---

## Functions & Methods

### `maintenanceGate(req, res, next)` (async middleware)

**Signature:** `async function maintenanceGate(req, res, next)`

**Description:** Checks the `maintenanceMode` database setting (cached for 30 seconds). If maintenance mode is active, allows `super_admin` users through by performing a session lookup, and returns `503` to everyone else. Auth endpoints (`/auth/*`) are always allowed through.

**Side effects:** Re-reads `Settings.get('maintenanceMode')` at most once every 30 seconds.

**Response on block:** `503 { error: 'System under maintenance' }`

---

### `softBanCheck(req, res, next)` (middleware)

**Signature:** `function softBanCheck(req, res, next)`

**Description:** Blocks users whose `blockedUntil` date is in the future, even if their account is still `active: true`. This implements temporary suspensions without full deactivation.

**Response on block:** `403 { error: 'Account temporarily suspended', until: Date }`

---

### `impersonationGuard(req, res, next)` (middleware)

**Signature:** `function impersonationGuard(req, res, next)`

**Description:** Blocks sensitive actions (such as password changes or profile edits) when the session is an admin impersonation session. `req.impersonator` is set by `authenticate` in `auth.js`.

**Response on block:** `403 { error: 'Action not permitted during impersonation' }`

---

### `currentDayGuard(req, res, next)` (middleware)

**Signature:** `function currentDayGuard(req, res, next)`

**Description:** Prevents non-admin users from submitting tracking data for any date other than today. If `req.body.date` is absent, the guard passes. Moderators, admins, and super_admins may modify any date.

**Response on block:** `403 { error: 'Users can only edit current-day recordings' }`

---

### `lastActiveTouch(req, res, next)` (middleware)

**Signature:** `function lastActiveTouch(req, res, next)`

**Description:** Updates `user.lastActiveAt` on the User document at most once per 5 minutes per user. The debouncing is handled via the module-level `lastTouched` Map. The save is fire-and-forget (`.catch(() => {})`).

**Side effects:** Writes to the `User` document in MongoDB asynchronously. Updates the `lastTouched` in-process map.

---

### `aiGateCheck(req, res, next)` (middleware)

**Signature:** `function aiGateCheck(req, res, next)`

**Description:** Blocks AI advice endpoints if the `ollamaEnabled` setting is false, or if the requesting user has not opted into AI features (`geminiOptIn: false`).

**Side effects:** Reads `Settings.get('ollamaEnabled')` on every call (no caching).

**Response on block:**
- `403 { error: 'AI features are disabled' }` — server-level disabled
- `403 { error: 'Please enable AI features in Settings' }` — user not opted in

---

## Exports

```js
module.exports = {
  maintenanceGate,
  softBanCheck,
  impersonationGuard,
  currentDayGuard,
  lastActiveTouch,
  aiGateCheck,
};
```

---

## Known Issues & Technical Debt

- `aiGateCheck` calls `Settings.get` on every request without caching, adding a DB round trip. The maintenance gate has a cache; the AI gate should too.
- `lastActiveTouch` stores debounce state in a module-level `Map`. In a multi-process deployment (e.g., PM2 cluster mode) each process has its own map, so `lastActiveAt` could be written more frequently than intended. The session-level `lastActiveAt` update in `authenticate` already handles this per-session, making the user-level update here somewhat redundant.
