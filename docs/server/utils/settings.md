# server/utils/settings.js

## File Overview

**File path:** `server/utils/settings.js`

Central access layer for all application configuration. All settings live in the MongoDB `Settings` collection. This module maintains a 15-second in-memory cache of the entire settings document so that hot paths (per-request JWT verification, SMTP config lookups, goal resolution) do not hit the database on every call. It also provides convenience wrappers that build typed config objects and resolve the effective goal for a user given the priority chain: per-day override > admin enforcement > user preference > default.

**Dependencies (internal):**
- `../models/Settings`
- `../models/User` (lazy `require` inside functions to avoid circular deps)
- `../models/DailyGoalOverride` (lazy `require`)
- `../models/OffDay` (lazy `require`)

**Dependencies (external):**
- `crypto` (Node.js built-in)

**Side effects when loaded:**
- Declares `_cache` (object), `_cacheTime` (number), and `CACHE_TTL` constant.

---

## Variables & Constants

| Variable | Type | Value | Description |
|---|---|---|---|
| `_cache` | `object` | `{}` | In-memory flat map of all setting keys to their values. Populated by `refreshCache()`. |
| `_cacheTime` | `number` | `0` | Unix timestamp (ms) of the last successful cache refresh. |
| `CACHE_TTL` | `number` | `15_000` | Cache lifetime in milliseconds (15 seconds). |

---

## Functions & Methods

### `refreshCache()`

**Signature:** `async function refreshCache(): Promise<void>`

**Description:** Reads all settings from `Settings.getAll()` and stores a flat key→value map in `_cache`. Skips the DB call if the cache is less than `CACHE_TTL` ms old and non-empty. Errors are silently swallowed so that stale cache is preserved when the DB is temporarily unavailable.

**Side effects:** Updates `_cache` and `_cacheTime`.

**Callers:** All exported async functions call this first.

---

### `invalidateCache()`

**Signature:** `function invalidateCache(): void`

**Description:** Resets `_cacheTime` to 0 so the next call to any exported function forces a fresh DB read. Called after any settings mutation.

**Callers:** `getJwtSecret()` (after auto-generating a new secret), admin settings update routes.

---

### `getSetting(key)`

**Signature:** `async function getSetting(key: string): Promise<any>`

**Returns:** The setting value from the cache, or via a direct `Settings.get(key)` fallback if the key is absent.

**Description:** Main low-level accessor for any individual setting by key.

**Callers:** Throughout the codebase — auth middleware, route handlers, `pushSender.js`, `streaks.js`, etc.

---

### `getJwtSecret()`

**Signature:** `async function getJwtSecret(): Promise<string>`

**Returns:** The JWT signing secret string.

**Description:** Returns the `jwtSecret` setting. If the setting is blank (first launch), auto-generates a 64-byte cryptographically random hex string, persists it via `Settings.set()`, and invalidates the cache.

**Side effects:** On first call with a blank DB, writes a new `jwtSecret` and invalidates cache.

**Callers:** `server/middleware/auth.js`.

---

### `getJwtExpiresIn()`

**Signature:** `async function getJwtExpiresIn(): Promise<string>`

**Returns:** The JWT expiry string (e.g. `'7d'`). Defaults to `'7d'` if not set.

**Callers:** Auth login/register endpoints in `server/routes/auth.js`.

---

### `getSmtpConfig()`

**Signature:** `async function getSmtpConfig(): Promise<{ host, port, secure, user, pass, from }>`

**Returns:** A typed SMTP config object built from cached settings. Defaults: port 587, not secure, `from` = `'StandUpTracker <noreply@example.com>'`.

**Callers:** `server/utils/email.js`.

---

### `getAppConfig()`

**Signature:** `async function getAppConfig(): Promise<{ appUrl, appName, port, sessionSecure }>`

**Returns:** A typed app config object. Defaults: `appUrl = 'http://localhost:3000'`, `appName = 'StandUpTracker'`, `port = 3000`.

**Callers:** `server/utils/email.js`, `server/index.js`.

---

### `isSetupComplete()`

**Signature:** `async function isSetupComplete(): Promise<boolean>`

**Returns:** `true` if at least one user exists and the `jwtSecret` setting is non-empty. Errors return `false`.

**Description:** Used by the setup wizard endpoint to determine whether first-launch setup has already been completed.

**Callers:** `server/routes/onboarding.js`.

---

### `getEffectiveGoalMinutes(user, date?)`

**Signature:** `async function getEffectiveGoalMinutes(user: User | string, date?: string): Promise<number>`

**Returns:** The effective daily standing goal in minutes for the given user and optional date.

**Description:** Priority chain:
1. If `date` is provided, checks `DailyGoalOverride` for the user+date pair. Returns override if found.
2. If `enforceDailyGoal` setting is truthy, returns `masterDailyGoalMinutes || 60`.
3. If `user` is a string (userId), fetches the User document and returns `dailyGoalMinutes || 60`.
4. Returns `user.dailyGoalMinutes || 60`.

**Side effects:** May issue DB queries for DailyGoalOverride and User.

**Callers:** `server/utils/recalcStats.js`, `server/utils/streaks.js`, route handlers computing progress.

---

### `isOffDay(userId, date)`

**Signature:** `async function isOffDay(userId: string | User, date: string): Promise<boolean>`

**Returns:** `true` if an OffDay document exists for this user and date.

**Description:** Accepts either a userId string or a User document; extracts the `userId` string in both cases.

**Callers:** `server/utils/streaks.js`.

---

### `isDayCountedInStats(totalSeconds, _date)`

**Signature:** `async function isDayCountedInStats(totalSeconds: number, _date: string): Promise<boolean>`

**Returns:** `true` if `totalSeconds` meets the minimum activity threshold (default: 1 minute).

**Description:** Reads `minActivityThresholdMinutes` setting. The `_date` parameter is accepted but ignored — the function applies the same threshold regardless of date.

**Callers:** Dashboard and tracking data formatting helpers.

---

### `getMinActivityThresholdSeconds()`

**Signature:** `async function getMinActivityThresholdSeconds(): Promise<number>`

**Returns:** `minActivityThresholdMinutes * 60`, defaulting to 60 (1 minute) if not set.

**Callers:** Leaderboard and stats route handlers.

---

## Exports

```js
module.exports = {
  getSetting, getJwtSecret, getJwtExpiresIn, getSmtpConfig, getAppConfig,
  isSetupComplete, invalidateCache, getEffectiveGoalMinutes,
  isOffDay, isDayCountedInStats, getMinActivityThresholdSeconds,
};
```

---

## Known Issues & Technical Debt

- The `isDayCountedInStats` `_date` parameter is never used and exists only to match a historical call signature. `[CANDIDATE FOR REMOVAL — the parameter is unused]`
- Lazy `require` of `User`, `DailyGoalOverride`, and `OffDay` inside functions avoids circular dependency issues but is a code smell; consider restructuring to break the cycle.
- The cache is process-global; running multiple Node workers (e.g. PM2 cluster mode) means settings changes only invalidate one worker's cache until TTL expires.
