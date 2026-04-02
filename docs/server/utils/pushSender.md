# server/utils/pushSender.js

## File Overview

**File path:** `server/utils/pushSender.js`

Delivers Web Push notifications to a user's registered browser subscriptions. It lazily configures the VAPID credentials on first use, respects per-user push opt-in and per-type preferences, and automatically cleans up expired subscriptions (HTTP 410/404 responses from the push service). If every subscription for a user has expired, the module disables push on the User document to prevent future wasted requests.

**Dependencies (internal):**
- `../models/PushSubscription`
- `../models/User`
- `./logger`
- `./settings` (`getSetting`)

**Dependencies (external):**
- `web-push`

**Side effects when loaded:**
- Declares module-level `vapidConfigured` flag (boolean, initially `false`).

---

## Variables & Constants

| Variable | Type | Value | Description |
|---|---|---|---|
| `vapidConfigured` | `boolean` | `false` | Module-level flag that becomes `true` after VAPID details have been successfully passed to `webpush.setVapidDetails()`. Cached so the keys are only read from the DB once per server lifetime (or after `resetVapidConfig()`). |

---

## Functions & Methods

### `ensureVapidConfigured()`

**Signature:** `async function ensureVapidConfigured(): Promise<boolean>`

**Returns:** `true` if VAPID details are now configured, `false` if keys are missing or a DB error occurred.

**Description:** Reads `vapidPublicKey`, `vapidPrivateKey`, and `vapidContactEmail` from the Settings collection and calls `webpush.setVapidDetails()`. If either key is blank the function returns `false` without configuring. Errors are swallowed and also return `false`. Skips all DB work on repeat calls once `vapidConfigured` is `true`.

**Side effects:** Sets `vapidConfigured = true` on success; calls `webpush.setVapidDetails()` which configures the global `web-push` state.

**Callers:** `sendPushNotification`

---

### `resetVapidConfig()`

**Signature:** `function resetVapidConfig(): void`

**Returns:** Nothing.

**Description:** Resets `vapidConfigured` to `false` so that the next call to `sendPushNotification` will re-read VAPID keys from the database. Must be called from the admin settings route after the operator updates the VAPID keys.

**Callers:** Exported; called by settings-update routes in `server/routes/admin.js` and `server/routes/notifications.js`.

---

### `sendPushNotification(userId, type, payload)`

**Signature:** `async function sendPushNotification(userId: string, type: string, payload: { title?: string, body?: string, icon?: string, url?: string, tag?: string }): Promise<void>`

**Returns:** Nothing (errors are logged, not thrown).

**Description:** Main entry point for push delivery. Flow:
1. Ensures VAPID is configured; returns early if not.
2. Loads the User document (only `pushEnabled` and `pushPreferences` fields) and returns early if push is disabled.
3. Checks `user.pushPreferences[type]`; returns early if explicitly set to `false`.
4. Loads all PushSubscription documents for the user.
5. Serialises the payload with defaults (`title`, `body`, `icon`, `url`, `tag`).
6. Calls `webpush.sendNotification()` for all subscriptions in parallel via `Promise.allSettled`.
7. On a per-subscription 410/404 response, deletes that PushSubscription document and logs at debug level.
8. If every subscription rejected and no subscriptions remain, sets `user.pushEnabled = false`.

**Side effects:** May delete `PushSubscription` documents; may update `User.pushEnabled`; emits log messages.

**Callers:** `server/utils/streaks.js` (streak milestones, streak broken events), `server/utils/notifications.js`, various route handlers.

---

## Exports

```js
module.exports = { sendPushNotification, resetVapidConfig };
```

| Export | Purpose |
|---|---|
| `sendPushNotification` | Called by streak utilities and notification helpers to deliver a push notification to a single user. |
| `resetVapidConfig` | Called after VAPID settings change so the new keys are applied on the next send. |

---

## Known Issues & Technical Debt

- `ensureVapidConfigured()` swallows all errors silently (empty `catch` block), making VAPID misconfiguration hard to diagnose in production.
- The module does not support per-subscription retry with exponential back-off; a transient network error causes permanent subscription removal if it happens to coincide with a legitimate 410.
- `vapidConfigured` is a module-level singleton; in a cluster (multiple workers) each worker maintains its own flag, which means the first request per worker always hits the DB.
