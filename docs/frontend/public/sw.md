# frontend/public/sw.js

## File Overview

**File path:** `frontend/public/sw.js`

The Progressive Web App Service Worker for the React SPA. It is intentionally minimal — it caches only the offline fallback page (`/offline.html`) and does not implement any app-shell or runtime caching strategy. Its primary responsibilities are:
1. Serving the offline fallback for failed navigation requests.
2. Displaying OS-level push notifications received from the server.
3. Handling notification clicks (focus existing window or open a new one).
4. Re-subscribing to push when the browser rotates the push subscription keys.

**Dependencies:** None (runs in the service worker global scope).

**Side effects when installed/activated:**
- Creates the `sut-offline-v1` cache and stores `/offline.html`.
- Deletes all other caches with different names (cache versioning).
- Claims all open client windows.

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `OFFLINE_CACHE` | `'sut-offline-v1'` | Cache storage name. Bumping the version here will trigger cache invalidation on the next activation. |
| `OFFLINE_URL` | `'/offline.html'` | Path of the offline fallback page pre-cached during install. |

---

## Event Handlers

### `install`

**Description:** Opens `OFFLINE_CACHE`, adds `/offline.html` to it, then calls `self.skipWaiting()` to activate the new service worker immediately without waiting for existing clients to close.

---

### `activate`

**Description:** Deletes all cache entries whose name is not `OFFLINE_CACHE` (removes stale versions), then calls `self.clients.claim()` so the new worker controls all open pages immediately.

---

### `fetch`

**Description:** Only intercepts navigation requests (`e.request.mode === 'navigate'`). Non-navigation requests (API calls, assets) are passed through unchanged. For navigation requests: attempts a network fetch; on failure, serves the cached `/offline.html`.

---

### `push`

**Description:** Receives a Web Push message from the server. Parses the payload as JSON (falls back to plain text). Displays an OS-level notification via `self.registration.showNotification()` using the `title`, `body`, `icon`, `badge`, `tag`, and `url` fields from the payload. Defaults: title `'StandUpTracker'`, icon/badge `'/vite.svg'`.

**Technical Debt:** The default badge/icon path `/vite.svg` is a Vite placeholder. In production this should point to the actual app icon.

---

### `notificationclick`

**Description:** Closes the notification, then uses `self.clients.matchAll()` to find an existing app window. If found, navigates it to `notification.data.url` and focuses it. If no window is found, opens a new one with `self.clients.openWindow(url)`. Defaults to `/dashboard` if no URL is stored in the notification.

---

### `pushsubscriptionchange`

**Description:** Fired when the browser rotates the push subscription keys (rare but possible). Automatically re-subscribes using the old subscription's options and POSTs the new subscription JSON to `/api/notifications/push/subscribe`. Errors are silently swallowed.

---

## Known Issues & Technical Debt

- The default notification `icon` and `badge` are `/vite.svg`, which is a development placeholder. These should be replaced with production icon paths.
- `pushsubscriptionchange` does not include any authentication header in the re-subscribe POST. For cookie-based auth this should work if the cookie is still valid, but it may fail for expired sessions.
- The service worker uses only `self.skipWaiting()` during install, which means a deploy that changes the SW could potentially interfere with in-flight timer sessions in open tabs.
- `[CANDIDATE FOR MERGE — see: public/sw.js]` The legacy `public/sw.js` implements a more aggressive caching strategy (stale-while-revalidate for all static assets). The two service workers serve different SPA generations and cannot be directly merged, but the offline handling patterns differ and should be reviewed if the legacy files are ever removed.
