# server/utils/streaks.js

## File Overview

**File path:** `server/utils/streaks.js`

Manages the entire streak lifecycle for the application: personal streaks, friend streaks (both users must meet their goal on the same day), and group streaks (all members must meet their goal). The file defines two primary triggers for streak state changes:

- **Trigger A** (`checkAndSetGoalMet`): Called after any tracking mutation. Sets or clears the `goalMet` flag on a `TrackingData` record and immediately recalculates the personal streak.
- **Trigger B** (`midnightRollover`): A scheduled job run once per day at midnight server time. Evaluates all users, friend pairs, and groups against yesterday's data, increments streaks where goals were met, and breaks streaks where they were not.

A startup integrity check (`startupStreakIntegrityCheck`) backfills missing `goalMet` flags and corrects any inconsistent streak values on server boot.

Off-days pause streaks (neither break nor increment them). Milestone notifications (3, 7, 14, 30, 50, 100, 200, 365 days) and push notifications are delivered on personal streak increments.

**Dependencies (internal):**
- `../models/FriendStreak`
- `../models/Friendship`
- `../models/Group`
- `../models/TrackingData`
- `../models/User`
- `../models/Notification`
- `./settings` (`getEffectiveGoalMinutes`, `isOffDay`)
- `./logger`
- `./pushSender` (`sendPushNotification`)

**Side effects when loaded:**
- Declares `_lastMidnightDate` (string | null) for idempotency tracking.
- Declares `_midnightTimer` (setTimeout handle | null) for the scheduler.

---

## Variables & Constants

| Variable | Type | Description |
|---|---|---|
| `_lastMidnightDate` | `string \| null` | Date string (`YYYY-MM-DD`) of the most recent midnight rollover. Used for idempotency. |
| `_midnightTimer` | `ReturnType<setTimeout> \| null` | Active timer handle for the scheduled midnight job. Cleared and replaced on each schedule call. |

---

## Functions & Methods

### `dateStr(daysAgo?)`

**Signature:** `function dateStr(daysAgo?: number = 0): string`

**Returns:** ISO date string (`YYYY-MM-DD`) for `daysAgo` days before today.

**Description:** Convenience helper used throughout the file for relative date arithmetic.

**Callers:** `midnightRollover`, `computePersonalStreak`, `recalcPersonalStreak`, `computeFriendStreak`, `computeGroupStreak`, `scheduleMidnightJob`.

---

### `streakPair(a, b)`

**Signature:** `function streakPair(a: string, b: string): { userA: string, userB: string }`

**Returns:** Object with `userA` always being the lexicographically smaller userId.

**Description:** Normalises a friend pair to a canonical order for consistent FriendStreak document lookup and creation. Exported for use in the social routes.

**Callers:** Exported; called by `server/routes/social.js`.

---

### `computePersonalStreak(userId, startDate?, maxDays?)`

**Signature:** `async function computePersonalStreak(userId: string, startDate?: string, maxDays?: number = 3650): Promise<number>`

**Returns:** The current personal streak count.

**Description:** Walks backward day by day from `startDate` (or today), skipping off-days. Stops and returns the count when a non-off-day has no `goalMet` record. Today is treated specially: if today has no goal-met record the walk continues past it (the day is not yet over).

**Callers:** `recalcPersonalStreak`, `startupStreakIntegrityCheck`.

---

### `computeBestStreak(userId)`

**Signature:** `async function computeBestStreak(userId: string): Promise<number>`

**Returns:** The best (longest) streak the user has ever achieved.

**Description:** Loads all `TrackingData` for the user, sorts dates, and walks forward counting consecutive `goalMet` days (off-days are skipped). Tracks the maximum run seen.

**Callers:** `recalcPersonalStreak`, `startupStreakIntegrityCheck`.

---

### `checkAndSetGoalMet(userId, date, io)`

**Signature:** `async function checkAndSetGoalMet(userId: string, date: string, io?: SocketIO.Server): Promise<void>`

**Description:** Trigger A entry point. Evaluates whether the user's `TrackingData` for `date` meets the effective goal. Sets or clears `record.goalMet`. If the date is an off-day, forces `goalMet = false`. Then calls `recalcPersonalStreak`. Errors are caught, logged, and not re-thrown.

**Side effects:** Mutates `TrackingData.goalMet`; calls `recalcPersonalStreak` which may update User and emit socket events.

**Callers:** `server/socket/handler.js` (on timer stop), `server/routes/api.js` (after tracking mutations), `server/routes/admin.js` (after admin time edits).

---

### `recalcPersonalStreak(userId, io)`

**Signature:** `async function recalcPersonalStreak(userId: string, io?: SocketIO.Server): Promise<void>`

**Description:** Recomputes `currentStreak` and `bestStreak` for the user. If either changed, persists the new values and emits a `STREAK_UPDATE` WebSocket event. On streak increment, checks whether the new value is a milestone (3, 7, 14, 30, 50, 100, 200, 365) and, if so, creates a `Notification` document, emits it on the socket, and calls `sendPushNotification`.

**Side effects:** May update `User.currentStreak` / `User.bestStreak`; emits `STREAK_UPDATE`; may create `Notification` document and send push notification.

**Callers:** `checkAndSetGoalMet`, `startupStreakIntegrityCheck`.

---

### `midnightRollover(io)`

**Signature:** `async function midnightRollover(io?: SocketIO.Server): Promise<void>`

**Description:** Trigger B. Idempotent (guarded by `_lastMidnightDate`). For the previous calendar day ("yesterday"):
- **Personal streaks:** For all users with `currentStreak > 0`, if yesterday was not an off-day and the goal was not met, resets `currentStreak` to 0. Creates `streak_broken` notification for streaks ≥ 3.
- **Friend streaks:** Iterates all FriendStreak documents. If both users met their goal yesterday, increments. If either missed, breaks. Emits `FRIEND_STREAK_UPDATE`.
- **Group streaks:** Iterates all Groups. If all members met their goal, increments. If any missed, breaks. Emits `GROUP_STREAK_UPDATE`.

Sets `_lastMidnightDate` on completion and logs a summary with counts.

**Side effects:** Updates User, FriendStreak, and Group documents; creates Notification documents; emits WebSocket events; sends push notifications.

**Callers:** `scheduleMidnightJob` (via setTimeout), `server/routes/scheduler.js` (admin manual trigger).

---

### `startupStreakIntegrityCheck(io)`

**Signature:** `async function startupStreakIntegrityCheck(io?: SocketIO.Server): Promise<void>`

**Description:** Runs on server boot (called from `server/index.js`). Four phases:
1. Backfills `goalMet` for all TrackingData records where the field is absent or null.
2. Recomputes `currentStreak` and `bestStreak` for all active users; corrects mismatches.
3. Recomputes `currentStreak` and `bestStreak` for all FriendStreak documents.
4. Recomputes `currentStreak` and `bestStreak` for all Group documents.

Logs a warning if the entire check takes more than 30 seconds.

**Side effects:** Potentially heavy DB write load on startup for large deployments; emits socket events for corrections.

**Callers:** `server/index.js` (on startup).

---

### `computeFriendStreak(userA, userB)`

**Signature:** `async function computeFriendStreak(userA: string, userB: string): Promise<number>`

**Returns:** Current friend streak between two users.

**Description:** Walks backward up to 365 days, skipping off-days for either user. Today is treated specially (does not break streak). Stops when a day is found where either user did not meet the goal.

**Callers:** `startupStreakIntegrityCheck`.

---

### `computeGroupStreak(memberIds)`

**Signature:** `async function computeGroupStreak(memberIds: string[]): Promise<number>`

**Returns:** Current group streak.

**Description:** Same walk-backward approach as `computeFriendStreak`, but checks all group member IDs. Today is treated specially.

**Callers:** `startupStreakIntegrityCheck`.

---

### `scheduleMidnightJob(io)`

**Signature:** `function scheduleMidnightJob(io?: SocketIO.Server): void`

**Description:** Calculates the milliseconds until local midnight, sets a `setTimeout` to call `midnightRollover`, and then recursively reschedules itself for the next midnight. Clears any existing timer before setting a new one. Logs the scheduled delay.

**Side effects:** Sets `_midnightTimer`; logs info message.

**Callers:** `server/index.js` (on startup).

---

## Exports

```js
module.exports = {
  checkAndSetGoalMet, midnightRollover, startupStreakIntegrityCheck,
  scheduleMidnightJob, dateStr, streakPair,
};
```

---

## Known Issues & Technical Debt

- `computePersonalStreak`, `computeFriendStreak`, and `computeGroupStreak` all issue one DB query per calendar day in the worst case (up to 3650, 365, and 365 queries respectively). For users with long histories this is very slow. A bulk query followed by an in-memory walk would be significantly more efficient.
- `midnightRollover` uses server local time (`new Date()`) to determine midnight. If the server is in a different timezone from users, the rollover does not happen at users' midnight.
- The friend streak logic in `midnightRollover` loads two separate Mongoose queries (all streaks with `currentStreak > 0` and all streaks with `lastSyncDate !== yesterday`) and then merges them with a Map; this could be replaced with a single query using `$or`.
- `computeBestStreak` loads all TrackingData dates then sorts them and re-walks — this reprocesses the full history on every recalc call.
