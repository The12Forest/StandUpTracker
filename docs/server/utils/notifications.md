# server/utils/notifications.js

## File Overview

**File path:** `server/utils/notifications.js`

Implements the scheduled notification scheduler. Runs periodically (called hourly from `server/index.js`) to send two types of proactive notifications: a standup reminder if a user has zero tracking by their preferred reminder hour, and a streak-at-risk warning in the 20-21 UTC window if the user has a streak and hasn't met their goal.

**Dependencies (internal):**
- `../models/Notification`, `../models/User`, `../models/TrackingData`
- `./logger`
- `./settings` (`getEffectiveGoalMinutes`, `isOffDay`)
- `./pushSender` (`sendPushNotification`)

**Dependencies (external):** None

---

## Functions & Methods

### `runNotificationScheduler(io)`

**Signature:** `async function runNotificationScheduler(io: Server): Promise<void>`

**Description:** Iterates over all active users and conditionally creates in-app and push notifications based on the current UTC hour and each user's tracking status for today.

**Parameters:**
- `io` — Socket.io server instance (optional). Used to emit `NOTIFICATION` events in real time.

**Flow:**
1. Gets current UTC hour and today's date string.
2. Loads all active users with `pushEnabled`, `standupReminderTime`, `currentStreak`, `dailyGoalMinutes`.
3. For each user:
   - Skips if today is an off day (`isOffDay`).
   - Resolves effective goal via `getEffectiveGoalMinutes`.
   - Loads today's TrackingData.
   - **Standup reminder:** If `hour >= reminderHour && hour < reminderHour + 1` and `todaySeconds === 0`: checks for an existing `standup_reminder` notification today; if none exists, creates one and emits via socket + push.
   - **Streak at risk:** If `hour >= 20 && hour < 21` and `currentStreak > 0` and `todaySeconds < goalSeconds`: checks for existing `streak_at_risk` notification today; if none exists, creates one and emits via socket + push.

**Side effects:**
- Creates `Notification` documents.
- Emits `NOTIFICATION` socket events.
- Calls `sendPushNotification`.
- Errors are caught and logged via `logger.warn` (never rethrown).

**Called by:** `server/index.js` on an hourly `setInterval`.

---

## Exports

```js
module.exports = { runNotificationScheduler };
```

---

## Known Issues & Technical Debt

- The streak-at-risk window is hardcoded to 20-21 UTC and cannot be configured per-user or via settings. Users in timezones where 20 UTC is early afternoon would receive the warning at an inconvenient time.
- The standup reminder uses `standupReminderTime` (a "HH:MM" string stored on the User doc), but the streak-at-risk is always UTC 20-21 with no user preference.
- The scheduler iterates users and fires N serial async calls (`isOffDay`, `getEffectiveGoalMinutes`, DB reads per user). On large user bases this loop can take a significant amount of time and each iteration hits the DB multiple times.
- Both notification types create a notification even if the user has push disabled; the in-app notification is still created and emitted. This is intentional but means the notification inbox fills regardless of push settings.
