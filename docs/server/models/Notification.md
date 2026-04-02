# server/models/Notification.js

## File Overview

**File path:** `server/models/Notification.js`

Defines the Mongoose model for in-app notifications. Notifications are created by the server (scheduler, route handlers, socket events) and displayed in the notification bell on the frontend. They are never auto-deleted; they accumulate and must be managed by the user or admin.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `Notification` model and its indexes.

---

## Classes & Models

### `Notification`

**Collection name:** `notifications`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userId` | `String` | Yes | — | UUID of the notification recipient |
| `type` | `String` (enum) | Yes | — | Notification category (see enum below) |
| `title` | `String` | Yes | — | Short headline shown in the bell dropdown |
| `message` | `String` | Yes | — | Longer descriptive message |
| `read` | `Boolean` | No | `false` | Whether the user has seen this notification |
| `data` | `Mixed` | No | — | Extra payload specific to the notification type |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Allowed `type` values:**
`standup_reminder`, `streak_at_risk`, `friend_request`, `friend_request_accepted`, `level_up`, `daily_goal_reached`, `group_invite`, `report_warning`, `report_cleared`, `admin_report_alert`

Note: The streak milestone notification types (`streak_milestone`, `streak_broken`, `friend_streak_broken`, `group_streak_broken`) are created in `server/utils/streaks.js` but are not listed in the schema enum, meaning they will fail Mongoose's enum validation on save.

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `userId` | — | Fetch all notifications for a user |
| Compound | `(userId, createdAt DESC)` | — | Paginated notification list (newest first) |
| Compound | `(userId, read)` | — | Count unread notifications efficiently |

---

## Exports

```js
module.exports = mongoose.model('Notification', notificationSchema);
```

Used by `server/routes/notifications.js`, `server/routes/api.js`, `server/routes/social.js`, `server/routes/reports.js`, `server/utils/notifications.js`, and `server/utils/streaks.js`.

---

## Known Issues & Technical Debt

- **Enum mismatch:** `server/utils/streaks.js` creates notifications with types `streak_milestone`, `streak_broken`, `friend_streak_broken`, and `group_streak_broken`, but these are not in the schema's enum array. Mongoose will throw a validation error on `Notification.create()` calls with these types. This is a functional bug.
- No TTL index. Notifications accumulate indefinitely. A 90-day or 180-day TTL index would prevent unbounded growth.
