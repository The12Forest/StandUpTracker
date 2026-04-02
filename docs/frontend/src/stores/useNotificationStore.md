# frontend/src/stores/useNotificationStore.js

## File Overview

**File path:** `frontend/src/stores/useNotificationStore.js`

Zustand store for managing in-app notifications. Maintains a list of the 50 most recent notifications, the unread count, and the open/closed state of the notification dropdown. Provides actions to fetch notifications from the API, mark individual notifications or all notifications as read, and receive real-time notifications pushed from the WebSocket.

**Dependencies (internal):**
- `../lib/api` (`api`)

**Dependencies (external):**
- `zustand` (`create`)

**Side effects when loaded:** None.

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `notifications` | `object[]` | `[]` | Array of notification objects (most recent first, max 50). |
| `unreadCount` | `number` | `0` | Count of unread notifications. |
| `open` | `boolean` | `false` | Whether the notification dropdown panel is currently open. |

---

## Actions

### `setOpen(open)`

**Signature:** `setOpen(open: boolean): void`

**Description:** Directly sets the `open` state.

---

### `toggleOpen()`

**Signature:** `toggleOpen(): void`

**Description:** Flips the `open` boolean.

---

### `fetch()`

**Signature:** `async fetch(): Promise<void>`

**Description:** Calls `GET /api/notifications` and updates `notifications` and `unreadCount`. Errors are silently swallowed.

**Callers:** `NotificationBell.jsx` (on mount).

---

### `fetchUnreadCount()`

**Signature:** `async fetchUnreadCount(): Promise<void>`

**Description:** Calls `GET /api/notifications/unread-count` and updates `unreadCount`. Errors are silently swallowed.

**Callers:** `useSocketStore.js` (on socket connect/reconnect).

---

### `markRead(id)`

**Signature:** `async markRead(id: string): Promise<void>`

**Description:** Calls `PUT /api/notifications/:id/read`, then optimistically updates the notification in `notifications` to `read: true` and decrements `unreadCount` by 1 (only if the notification was previously unread). Errors are silently swallowed.

**Callers:** `NotificationBell.jsx` (on notification click).

---

### `markAllRead()`

**Signature:** `async markAllRead(): Promise<void>`

**Description:** Calls `PUT /api/notifications/read-all`, then sets all notifications to `read: true` and resets `unreadCount` to 0. Errors are silently swallowed.

**Callers:** `NotificationBell.jsx` ("Mark all read" button).

---

### `addNotification(notif)`

**Signature:** `addNotification(notif: object): void`

**Description:** Prepends a new notification to the `notifications` array (keeping max 50) and increments `unreadCount` by 1. Called from the WebSocket event listener.

**Callers:** `useSocketStore.js` (on `NOTIFICATION` socket event).

---

### `setUnreadCount(count)`

**Signature:** `setUnreadCount(count: number): void`

**Description:** Directly sets `unreadCount`. Called from the WebSocket `NOTIFICATION_COUNT` event.

**Callers:** `useSocketStore.js`.

---

## Exports

```js
export default useNotificationStore;
```

---

## Known Issues & Technical Debt

- All API calls silently swallow errors (`catch { /* ignore */ }`), making it impossible to surface API failures to the user. Consider at minimum logging errors in development.
- `markRead` performs an optimistic update without a rollback on failure; if the API call fails silently, the UI shows a notification as read even though the server did not update it.
