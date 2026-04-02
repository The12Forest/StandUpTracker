# frontend/src/lib/pushNotifications.js

## File Overview

**File path:** `frontend/src/lib/pushNotifications.js`

Client-side helper library for Web Push notification management. Provides browser capability detection, permission requesting, subscription creation (using the server's VAPID public key), and subscription removal. Called from `SettingsPage` when the user toggles push notifications.

**Dependencies (internal):**
- `./api` (`api`)

**Dependencies (external):**
- `Notification`, `navigator.serviceWorker`, `PushManager` (browser built-ins)

**Side effects when loaded:** None.

---

## Functions & Methods

### `isPushSupported()`

**Signature:** `export function isPushSupported(): boolean`

**Returns:** `true` if `serviceWorker`, `PushManager`, and `Notification` are all available in the current browser.

**Callers:** `SettingsPage.jsx`.

---

### `getPermissionState()`

**Signature:** `export function getPermissionState(): 'granted' | 'denied' | 'default'`

**Returns:** The current `Notification.permission` value, or `'denied'` if the `Notification` API is absent.

**Callers:** `SettingsPage.jsx`.

---

### `subscribeToPush()`

**Signature:** `export async function subscribeToPush(): Promise<{ success: boolean, reason?: string }>`

**Returns:** `{ success: true }` on success or `{ success: false, reason: string }` with a human-readable explanation on failure.

**Description:**
1. Returns `{ success: false }` if push is not supported.
2. If permission is `'default'`, requests it via `Notification.requestPermission()`; returns failure with a browser-settings message if denied.
3. If permission is `'denied'`, returns failure with instructions to re-enable in browser settings.
4. Fetches the VAPID public key from `GET /api/notifications/push/vapid-key`.
5. Waits for `navigator.serviceWorker.ready`, then calls `registration.pushManager.subscribe()` with `userVisibleOnly: true` and the base64-decoded public key.
6. POSTs the subscription JSON to `POST /api/notifications/push/subscribe`.
7. Catches all errors and returns `{ success: false, reason: err.message }`.

**Side effects:** Requests browser permission; creates a push subscription in the browser and on the server; sends a POST to the backend.

**Callers:** `SettingsPage.jsx`.

---

### `unsubscribeFromPush()`

**Signature:** `export async function unsubscribeFromPush(): Promise<{ success: boolean, reason?: string }>`

**Returns:** `{ success: true }` on success or `{ success: false, reason: string }` on failure.

**Description:** Gets the current push subscription from the service worker. If found, calls `subscription.unsubscribe()` and POSTs the endpoint to `POST /api/notifications/push/unsubscribe` for server-side cleanup. If no local subscription exists, still POSTs to the server to clean up any orphaned server records.

**Side effects:** Unregisters the browser subscription; sends a POST to the backend.

**Callers:** `SettingsPage.jsx`.

---

### `urlBase64ToUint8Array(base64String)` (private)

**Signature:** `function urlBase64ToUint8Array(base64String: string): Uint8Array`

**Returns:** A `Uint8Array` decoded from a URL-safe base64 string (with padding added as needed).

**Description:** Converts the VAPID public key from the server's URL-safe base64 format to the `Uint8Array` expected by `pushManager.subscribe()`.

**Callers:** `subscribeToPush` (internal only).

---

## Exports

```js
export { isPushSupported, getPermissionState, subscribeToPush, unsubscribeFromPush };
```

---

## Known Issues & Technical Debt

- `urlBase64ToUint8Array` uses `atob()` which is synchronous and may throw for malformed input; the error is not specifically caught or reported.
- There is no mechanism to refresh or verify an existing subscription on page load; a stale subscription that was deleted server-side will silently fail until the user toggles push off and on again.
