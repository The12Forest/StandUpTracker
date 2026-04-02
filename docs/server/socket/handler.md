# server/socket/handler.js

## File Overview

**File path:** `server/socket/handler.js`

Configures Socket.io authentication, room management, and all real-time event handlers. Manages a server-authoritative global counter state and server-side personal timer start/stop logic. Provides NTP clock sync and heartbeat support.

**Dependencies (internal):**
- `../models/User`, `../models/Session`, `../models/Friendship`, `../models/Notification`, `../models/TrackingData`
- `../utils/logger`
- `../utils/settings` (`getEffectiveGoalMinutes`)
- `../utils/streaks` (`checkAndSetGoalMet`)
- `../utils/recalcStats` (`recalcUserStats`)
- `../utils/pushSender` (`sendPushNotification`)

**Dependencies (external):**
- `socket.io` (via `io` parameter)

**Side effects when loaded:**
- Declares module-level `counterState` object (global counter SSoT).
- Declares module-level `_midnightTimer` variable (unused here, but pattern shared with streaks.js).

---

## Variables & Constants

| Variable | Type | Description |
|---|---|---|
| `counterState` | `Object` | Module-level singleton: `{ running, startedBy, startedAt }`. Single source of truth for the shared counter across all connected clients. |

---

## Functions & Methods

### `setupSocket(io)`

**Signature:** `function setupSocket(io: Server): void`

**Description:** The main exported function. Configures the Socket.io middleware stack and all event handlers.

**Side effects:**
- Registers a socket authentication middleware that validates session tokens against the DB.
- On each socket connection: joins user/admin/authenticated/friend rooms, sends initial state (counter, timer, notification count).
- Attaches event listeners on each socket for COUNTER_START/STOP, TRACKING_UPDATE, TIMER_START/STOP, HEARTBEAT, NTP_PING, disconnect.

**Called by:** `server/index.js` → `setupSocket(io)`.

---

### Socket Authentication Middleware

**Trigger:** Every new Socket.io connection attempt.

**Flow:**
1. Reads `socket.handshake.auth.token`.
2. Looks up Session in DB; rejects if expired.
3. Loads User from DB; rejects if not active.
4. Attaches `socket.user` (userId, username, role, emailVerified) and `socket.sessionId`.
5. If impersonation session: attaches `socket.user.impersonator`.

---

### On Connection

**Rooms joined:**
- `user:${userId}` — personal room for cross-device sync.
- `admins` — if role is `admin` or `super_admin`.
- `authenticated` — all authenticated users.
- `friends:${friendId}` — one room per accepted friend (for FRIEND_ONLINE/OFFLINE events).

**Initial emissions on connect:**
- `STATE_SYNC` — current counter state + `serverTime`.
- `TIMER_SYNC` — personal timer state (running, startedAt, serverTime).
- `NOTIFICATION_COUNT` — unread count.
- `broadcastConnectionCount(io)` — updates admins with new connection count.
- `FRIEND_ONLINE` — emitted to each friend's `user:${friendId}` room.

---

### `COUNTER_START` event

**Guard:** No-op if `counterState.running` is already true.

**Flow:** Sets `counterState.running = true`, `startedBy`, `startedAt`. Emits `STATE_SYNC` to all `authenticated` clients. Emits `ADMIN_BROADCAST` to `admins` room.

### `COUNTER_STOP` event

**Guard:** No-op if `counterState.running` is already false.

**Flow:** Calculates duration from `startedAt`. Resets counter state. Emits `STATE_SYNC` to `authenticated`. Emits `ADMIN_BROADCAST` with `duration` to `admins`.

### `TRACKING_UPDATE` event

Relays tracking update to the user's other devices via `socket.to('user:${userId}').emit('TRACKING_SYNC', data)`. No DB writes.

### `TIMER_START` event

**Guard:** Requires `emailVerified`. Uses atomic `findOneAndUpdate` with `{ timerRunning: { $ne: true } }` to prevent double-start.

**Flow:** Sets `timerRunning: true`, `timerStartedAt: now` on User. Emits `TIMER_SYNC` to all user devices. Emits `LEADERBOARD_UPDATE` to `authenticated`.

### `TIMER_STOP` event

**Guard:** Requires `emailVerified`. Uses atomic `findOneAndUpdate` with `{ timerRunning: true }` returning the pre-update doc to get `timerStartedAt`.

**Flow:**
1. Calculates `sessionSeconds` (clamped 0-86400).
2. If sessionSeconds >= 1: upserts TrackingData with `$inc` and `$push`. Detects goal-reached crossing. Calls `recalcUserStats`. Emits `STATS_UPDATE` and `FRIEND_STATS_UPDATE`. Creates level_up and daily_goal_reached notifications if applicable. Calls `checkAndSetGoalMet` (async, fire-and-forget). Emits `LEADERBOARD_UPDATE`.
3. Emits `TIMER_SYNC` (running: false) to all user devices.

### `HEARTBEAT` event

Responds with `HEARTBEAT_ACK { timestamp }`. Used for PWA keep-alive.

### `NTP_PING` event

Receives `{ t0 }` (client send time). Responds with `NTP_PONG { t0, t1: now, t2: now }` for client-side clock offset calculation.

### `disconnect` event

Checks if any remaining sockets exist for this user in their room. If zero remain: loads accepted friendships and emits `FRIEND_OFFLINE` to each friend. Calls `broadcastConnectionCount`.

---

### `broadcastConnectionCount(io)`

**Signature:** `async function broadcastConnectionCount(io): void`

**Description:** Fetches all connected sockets and emits `CONNECTION_COUNT { count }` to the `admins` room. Called on connect and disconnect.

---

## Exports

```js
module.exports = { setupSocket };
```

---

## Known Issues & Technical Debt

- `TIMER_STOP` uses `$inc` to accumulate seconds in TrackingData, which could drift if called concurrently (e.g., from both HTTP and socket). The HTTP timer stop in `api.js` does the same, so two concurrent stop events could double-count the session.
- `computePersonalStreak` and `computeBestStreak` (called via `checkAndSetGoalMet` on TIMER_STOP) walk TrackingData records one at a time per day in a loop — this is O(N) serial DB queries per streak calculation and scales poorly.
- The global `counterState` object is in-memory only. On multi-process or clustered deployments, each process has its own counter state, causing inconsistency. No persistence or cross-process sync.
- `io.fetchSockets()` is called on every disconnect to count connections, which scans all sockets. On large deployments this may be expensive if called frequently.
