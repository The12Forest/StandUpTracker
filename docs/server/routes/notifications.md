# server/routes/notifications.js

## File Overview

**File path:** `server/routes/notifications.js`

Handles in-app notification management (list, mark read, mark all read, unread count) and Web Push subscription management (subscribe, unsubscribe, update preferences, get VAPID public key). All routes require authentication.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`)
- `../middleware/guards` (`softBanCheck`, `lastActiveTouch`)
- `../models/Notification`, `../models/PushSubscription`, `../models/User`
- `../utils/settings` (`getSetting`)

**Dependencies (external):**
- `express`

---

## Route Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List up to 50 notifications for current user (newest first) |
| `GET` | `/unread-count` | Return only the unread notification count |
| `PUT` | `/read-all` | Mark all unread notifications as read |
| `PUT` | `/:id/read` | Mark a specific notification as read |
| `GET` | `/push/vapid-key` | Return the VAPID public key for subscription setup |
| `POST` | `/push/subscribe` | Save a new push subscription; set `user.pushEnabled = true` |
| `POST` | `/push/unsubscribe` | Remove a subscription (or all) and update `user.pushEnabled` |
| `PUT` | `/push/preferences` | Update push type preferences and reminder time |

---

## Route Details

### `PUT /read-all`

Must be declared before `/:id/read` in the route file to prevent Express from treating `'read-all'` as an `:id` parameter.

### `POST /push/subscribe`

Accepts a full Web Push `subscription` object (endpoint + p256dh + auth keys). Upserts by `(userId, endpoint)`. Sets `user.pushEnabled = true` on the User document.

### `POST /push/unsubscribe`

If `endpoint` is provided, removes that specific subscription. If no endpoint is provided, removes all subscriptions for the user. If no subscriptions remain, sets `user.pushEnabled = false`.

### `PUT /push/preferences`

Validates `standupReminderTime` as HH:MM format (00:00-23:59). Accepts partial `pushPreferences` objects and only updates the recognized keys.

---

## Known Issues & Technical Debt

- The notifications list is hard-capped at 50 and not paginated. Users with many notifications cannot retrieve older entries via this endpoint.
- Error handlers in most routes use bare `catch { }` (no `err` parameter), silently swallowing the error detail in logs.
