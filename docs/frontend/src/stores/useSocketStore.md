# frontend/src/stores/useSocketStore.js

## File Overview

**File path:** `frontend/src/stores/useSocketStore.js`

Zustand store that manages the Socket.io client connection and all real-time WebSocket event handling. On `connect()`, it creates a Socket.io instance authenticated with the in-memory session token, registers all server-to-client event handlers, and stores the socket instance in state. Event handlers fan out incoming data to the appropriate stores (`useTimerStore`, `useNotificationStore`, `useAuthStore`).

**Dependencies (internal):**
- `../lib/api` (`getToken`)
- `./useTimerStore`
- `./useNotificationStore`
- `./useAuthStore`

**Dependencies (external):**
- `zustand` (`create`)
- `socket.io-client` (`io`)

**Side effects when loaded:** None.

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `socket` | `Socket \| null` | `null` | Active Socket.io client instance. |
| `connected` | `boolean` | `false` | Whether the socket is currently connected. |
| `connectionCount` | `number` | `0` | Server-broadcast count of authenticated connections (admin overview). |

---

## Actions

### `connect()`

**Signature:** `connect(): void`

**Description:** Creates a new Socket.io client if one does not already exist and is connected. Disconnects any stale disconnected socket first. Authenticates with `{ auth: { token } }` using the in-memory session token from `getToken()`. Returns immediately if the token is absent. Registers all event handlers (see below) and stores the socket instance.

**Side effects:** Creates WebSocket connection; registers event listeners; triggers initial `fetchState()` and `loadToday()` on connect.

**Callers:** `App.jsx` (on user state change).

---

### `disconnect()`

**Signature:** `disconnect(): void`

**Description:** Calls `socket.disconnect()` and resets `socket` and `connected` to their initial values.

**Callers:** `Sidebar.jsx` (on logout).

---

### `emit(event, data)`

**Signature:** `emit(event: string, data?: any): void`

**Description:** Emits a socket event if the socket is connected. No-ops if disconnected.

**Callers:** `useNtpSync.js` (NTP_PING events, via socket directly).

---

### `on(event, handler)`

**Signature:** `on(event: string, handler: Function): void`

**Description:** Registers an event listener on the current socket. No-ops if socket is null.

**Callers:** `StreaksPage.jsx`, `SocialPage.jsx`, `GroupsPage.jsx`.

---

### `off(event, handler)`

**Signature:** `off(event: string, handler: Function): void`

**Description:** Removes an event listener from the current socket.

**Callers:** `StreaksPage.jsx`, `SocialPage.jsx`, `GroupsPage.jsx`.

---

## Registered Socket Events

| Event | Description |
|---|---|
| `connect` | Sets `connected: true`; triggers `fetchState()`, `loadToday()`, `fetchUnreadCount()`. |
| `disconnect` | Sets `connected: false`. |
| `CONNECTION_COUNT` | Updates `connectionCount` from server broadcast. |
| `TIMER_SYNC` | Calls `useTimerStore.syncFromServer(data)` for cross-device timer state sync. |
| `STATS_UPDATE` | Calls `useTimerStore.syncStats(data)` and updates `useAuthStore.user` fields (`totalStandingSeconds`, `totalDays`, `currentStreak`, `bestStreak`, `level`). |
| `NOTIFICATION` | Calls `useNotificationStore.addNotification(notif)`. |
| `NOTIFICATION_COUNT` | Calls `useNotificationStore.setUnreadCount(data.count)`. |
| `STREAK_UPDATE` | Updates `currentStreak` and `bestStreak` on `useAuthStore.user`. |
| `FRIEND_STREAK_UPDATE` | No-op (comment says "Trigger a refetch on pages that display friend streaks"). `[CANDIDATE FOR IMPROVEMENT — event is registered but does nothing]` |
| `GROUP_STREAK_UPDATE` | No-op (same pattern). `[CANDIDATE FOR IMPROVEMENT]` |
| `SETTINGS_CHANGED` | Calls `useAuthStore.refreshUser()` to reload profile with new enforcement settings. |

---

## Exports

```js
export default useSocketStore;
```

---

## Known Issues & Technical Debt

- `FRIEND_STREAK_UPDATE` and `GROUP_STREAK_UPDATE` handlers are registered but do nothing. Pages that need these updates (`StreaksPage`) register their own listeners via `on()`/`off()`. This is redundant — either the store should dispatch the update or pages should not need to register separately.
- The socket is created without an explicit `reconnectionAttempts` limit; by default Socket.io will retry indefinitely, which may be appropriate but means stale connections (e.g. after server restart) retry silently.
- `emit()` and `on()`/`off()` are thin wrappers around `socket.*`; they could be replaced by exposing `socket` directly to callers, but the wrappers provide null-safety.
