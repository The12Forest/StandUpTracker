# frontend/src/components/NotificationBell.jsx

## File Overview

**File path:** `frontend/src/components/NotificationBell.jsx`

A bell icon button with a red unread badge that opens a dropdown panel listing recent notifications. Each notification type is mapped to a Lucide icon and accent colour. Unread notifications have a highlighted background and a green dot indicator. Clicking an unread notification marks it as read. The panel closes when the user clicks outside it.

**Dependencies (internal):**
- `../stores/useNotificationStore`

**Dependencies (external):**
- `react` (`useEffect`, `useRef`)
- `lucide-react` (`Bell`, `CheckCheck`, `Flame`, `Target`, `Users`, `TrendingUp`, `Clock`, `UsersRound`)

**Side effects when mounted:** Fetches notifications from the API via `fetchNotifs()` on mount.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `TYPE_ICONS` | `object` | Maps notification type strings to Lucide icon components. Types: `standup_reminder`, `streak_at_risk`, `friend_request`, `friend_request_accepted`, `level_up`, `daily_goal_reached`, `group_invite`. |
| `TYPE_COLORS` | `object` | Maps notification type strings to Tailwind text colour classes. |

---

## Functions & Methods

### `timeAgo(dateStr)` (private)

**Signature:** `function timeAgo(dateStr: string): string`

**Returns:** Human-readable relative time: `"Just now"`, `"Xm ago"`, `"Xh ago"`, `"Xd ago"`.

---

### `NotificationBell()` (default export)

**Signature:** `export default function NotificationBell(): JSX.Element`

**Description:**
- Subscribes to `notifications`, `unreadCount`, `open`, `toggleOpen`, `setOpen`, `fetch`, `markRead`, and `markAllRead` from `useNotificationStore`.
- On mount: calls `fetchNotifs()`.
- When `open` is true: registers a `mousedown` listener on `document` to close the panel on outside clicks.
- Bell button: shows a red badge with unread count (capped at "99+").
- Dropdown panel (rendered when `open`): fixed-width dropdown anchored to the bell button. Shows a "Mark all read" button in the header if there are unread items. Lists notifications newest-first with icon, title, message, and relative time. Clicking an unread notification calls `markRead`.

**Side effects:** Registers/removes document event listener when panel opens/closes.

**Callers:** `AppLayout.jsx`.

---

## Exports

| Export | Description |
|---|---|
| `default NotificationBell` | Rendered in the top bar of `AppLayout`. |

---

## Known Issues & Technical Debt

- The notification list is limited to 50 items in the store (enforced in `addNotification`), but there is no "load more" or pagination in the dropdown for older notifications.
- `streak_milestone` and `streak_broken` notification types are not present in `TYPE_ICONS`; they fall back to the generic `Bell` icon and `text-zen-400` colour.
