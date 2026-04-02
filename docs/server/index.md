# server/index.js

## File Overview

**File path:** `server/index.js`

This is the application entry point. It creates the Express app and HTTP server, configures security middleware (Helmet, CORS), mounts all API route groups, registers the SPA fallback for client-side routes, initializes the Socket.io server, connects to MongoDB (with an automatic fallback to an in-memory server), and starts recurring background jobs (streak integrity check, midnight rollover, notification scheduler, session cleanup).

**Dependencies (internal):**
- `./config` — MongoDB URI
- `./utils/logger`
- `./routes/auth`, `./routes/api`, `./routes/admin`, `./routes/leaderboard`, `./routes/social`, `./routes/groups`, `./routes/ai`, `./routes/notifications`, `./routes/reports`, `./routes/scheduler`, `./routes/onboarding`
- `./middleware/guards` — `maintenanceGate`
- `./socket/handler` — `setupSocket`
- `./utils/streaks` — `startupStreakIntegrityCheck`, `scheduleMidnightJob`
- `./utils/notifications` — `runNotificationScheduler`
- `./utils/settings` — `isSetupComplete`, `getSetting`
- `./models/Session`

**Dependencies (external):**
- `express`, `http`, `path`, `fs` (Node built-ins)
- `mongoose`
- `helmet`
- `cors`
- `socket.io`
- `mongodb-memory-server` (optional, required lazily on primary MongoDB failure)

**Side effects when loaded:**
- Calls `start()` immediately, which connects to MongoDB and starts the HTTP server.
- Registers four recurring timers: midnight streak job, notification scheduler (hourly), session cleanup (hourly), and a one-time startup streak integrity check.

---

## Variables & Constants

| Name | Type | Description |
|---|---|---|
| `app` | `express.Application` | The Express application instance |
| `server` | `http.Server` | Wraps `app` to support Socket.io |
| `io` | `socket.io.Server` | Socket.io server instance with dynamic CORS from DB |
| `reactDist` | `string` | Absolute path to `frontend/dist` |
| `legacyPublic` | `string` | Absolute path to `public/` |
| `staticDir` | `string` | Resolves to `reactDist` if it exists, else `legacyPublic` |
| `spaPages` | `string[]` | Array of URL patterns served by the SPA fallback |

---

## Functions & Methods

### `start()` (async, immediately invoked)

**Signature:** `async function start(): Promise<void>`

**Description:** Orchestrates the full application startup sequence:
1. Connects to MongoDB using `config.mongoUri`. On failure, attempts to start an in-memory MongoDB via `mongodb-memory-server`.
2. Reads the `appUrl` setting from the database and stores it on the Express app as `corsOrigin`.
3. Fires `startupStreakIntegrityCheck(io)` (non-blocking).
4. Schedules the midnight streak rollover via `scheduleMidnightJob(io)`.
5. Schedules the notification scheduler to run every hour.
6. Schedules session cleanup to run every hour.
7. Reads `serverPort` from settings (default 3000) and calls `server.listen()`.

**Side effects:** Starts the HTTP server, registers all background jobs, writes logs via `logger`.

---

## Route Mounting Order

| Path | Router | Notes |
|---|---|---|
| `GET /api/setup/status` | Inline handler | Always public; returns setup completion status |
| `/api/setup` | `onboardingRoutes` | Only functional when setup is incomplete |
| `/api` (gate) | Setup guard middleware | Returns 503 if setup incomplete, except `/setup` paths |
| `/api` (gate) | `maintenanceGate` | Returns 503 for non-super_admin during maintenance |
| `/api/auth` | `authRoutes` | Registration, login, session management, 2FA |
| `/api` | `apiRoutes` | Timer, tracking, stats |
| `/api/admin` | `adminRoutes` | Admin-only user/system management |
| `/api/leaderboard` | `leaderboardRoutes` | Public leaderboard |
| `/api/social` | `socialRoutes` | Friends, friend requests |
| `/api/groups` | `groupRoutes` | Group management |
| `/api/ai` | `aiRoutes` | AI advice via Ollama |
| `/api/notifications` | `notificationRoutes` | Notification CRUD, push subscriptions |
| `/api/reports` | `reportRoutes` | User abuse reports |
| `/api/scheduler` | `schedulerRoutes` | Weekly schedule view |

---

## Exports

```js
module.exports = { app, io };
```

Used by tests or other modules that need a reference to the Express app or Socket.io instance.

---

## Known Issues & Technical Debt

- `mongodb-memory-server` is a `devDependency` in `package.json` but is `require()`-d at runtime on primary DB failure. In a Docker image built with `--omit=dev` it will not be available, causing a hard crash if the primary MongoDB is down.
- `contentSecurityPolicy: false` is passed to Helmet, disabling CSP headers entirely. This is a security regression; a proper CSP policy should be defined.
- The SPA fallback registers individual explicit routes instead of a single wildcard. New SPA routes must be manually added to the `spaPages` array, which is an easy point of omission.
