# public/js/app.js

## File Overview

**File path:** `public/js/app.js`

The main application logic for the legacy vanilla-JS SPA. Wrapped in an IIFE for scope isolation. Handles authentication (token from `localStorage`), Socket.io connection, timer start/stop, stat display, tracking history chart (Chart.js), leaderboard, admin panel, and user settings. This is the monolithic entry point for `app.html`.

**Dependencies:**
- `localStorage` (`sut_token`, `sut_user`)
- Socket.io client (assumed loaded globally)
- Chart.js (assumed loaded globally)
- `/api/*` endpoints (Bearer token auth)

**Side effects when loaded:** Immediately checks for `sut_token` in localStorage and redirects to `/login` if absent. Initialises socket, loads all page data.

---

## Key Helpers (private, inside IIFE)

| Function | Description |
|---|---|
| `pad(n)` | Zero-pads a number to 2 digits. |
| `fmt(s)` | Formats total seconds to `HH:MM:SS`. |
| `fmtShort(s)` | Formats total seconds to `Xh Ym`. |
| `today()` | Returns today's date as `YYYY-MM-DD`. |
| `escapeHtml(t)` | Escapes HTML entities for safe DOM injection. |
| `showToast(msg, type)` | Creates and auto-dismisses a toast element. |

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy file superseded by the React SPA stores and pages.
- Uses `localStorage` Bearer token auth, which is less secure than HttpOnly cookies.
- `fmt` and `fmtShort` duplicate logic from `frontend/src/lib/utils.js` (`formatTime`, `formatMinutes`). `[DUPLICATE OF: frontend/src/lib/utils.js]`
- `showToast` duplicates toast functionality from `frontend/src/stores/useToastStore.js`. `[DUPLICATE OF: frontend/src/stores/useToastStore.js]`
- `today()` duplicates `frontend/src/lib/utils.js` `todayKey()`. `[DUPLICATE OF: frontend/src/lib/utils.js]`
- The file is very large (the monolithic IIFE pattern makes it hard to navigate and maintain).
