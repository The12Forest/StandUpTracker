# public/sw.js

## File Overview

**File path:** `public/sw.js`

Service worker for the legacy vanilla-JS SPA. Uses a `sut-v2` cache with a stale-while-revalidate strategy for all non-API static assets. Pre-caches a hardcoded list of static files on install. Handles Web Push notifications and notification clicks. Uses a broader caching strategy than the React SPA's service worker (`frontend/public/sw.js`), which caches only the offline fallback.

**Dependencies:** None (service worker global scope).

**Side effects when installed/activated:**
- Pre-caches all files in `STATIC_ASSETS`.
- Deletes caches named anything other than `sut-v2`.

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `CACHE_NAME` | `'sut-v2'` | Cache storage name. |
| `STATIC_ASSETS` | Array of 13 paths | Files pre-cached on install: `/`, `/app`, `/login`, `/register`, `/leaderboard`, CSS, JS files, icons, and manifest. |

---

## Event Handlers

### `install`

Pre-caches all `STATIC_ASSETS`. Calls `self.skipWaiting()` immediately (not via `e.waitUntil`).

### `activate`

Deletes all caches except `sut-v2`. Claims clients.

### `push`

Displays an OS notification. Ignores `renotify`, `badge` uses `/favicon.png`.

### `notificationclick`

Same focus-or-open logic as the React SPA's service worker.

### `fetch`

**Strategy:** Stale-while-revalidate. Skips `/api/` and `/socket.io/` paths entirely. For all other requests: returns cached response immediately if available while simultaneously fetching from network and updating the cache. Falls back to cached response if network fails.

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy service worker. The React SPA (`frontend/public/sw.js`) is the active service worker for the production deployment.
- `self.skipWaiting()` is called outside `e.waitUntil()` in the install handler, which means the pre-caching may not be complete before the worker activates.
- The `STATIC_ASSETS` list is hardcoded and will silently fail to cache if any file is renamed or removed.
- `[DUPLICATE OF: frontend/public/sw.js — push and notificationclick handlers are near-identical]`
