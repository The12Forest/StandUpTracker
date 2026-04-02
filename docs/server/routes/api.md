# server/routes/api.js

## File Overview

**File path:** `server/routes/api.js`

The main user-facing API route file. Implements timer start/stop (server-authoritative), tracking data CRUD, user stats, extended stats with personal records and trends, forgotten checkout detection and finalization, and user profile/settings self-service endpoints (username change, goal setting, email change, 2FA setup, etc.). All routes require authentication and apply `softBanCheck` and `lastActiveTouch` via the router-level middleware.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`, `requireVerified`)
- `../middleware/guards` (`currentDayGuard`, `softBanCheck`, `lastActiveTouch`)
- `../models/TrackingData`, `../models/Notification`, `../models/User`, `../models/OffDay`
- `../utils/streaks` (`checkAndSetGoalMet`)
- `../utils/settings` (`getEffectiveGoalMinutes`, `getSetting`, `getMinActivityThresholdSeconds`)
- `../utils/recalcStats` (`recalcUserStats`)
- `../utils/pushSender` (`sendPushNotification`)
- `../models/AuditLog`, `../models/Settings`

**Dependencies (external):**
- `express`

---

## Route Summary

| Method | Path | Middleware | Description |
|---|---|---|---|
| `GET` | `/timer/state` | auth | Get current timer running state and `startedAt` timestamp |
| `POST` | `/timer/start` | auth, verified | Atomically start the timer; broadcasts `TIMER_SYNC` |
| `POST` | `/timer/stop` | auth, verified, currentDayGuard | Atomically stop timer, save session, recalc stats, emit notifications |
| `POST` | `/tracking` | auth, verified, currentDayGuard | Save tracking data manually (legacy/migration path) |
| `GET` | `/tracking` | auth, verified | Get tracking records for date range |
| `POST` | `/tracking/sync` | auth, verified | Bulk sync from localStorage (migration; max 365 records) |
| `GET` | `/stats` | auth | Get basic user stats |
| `GET` | `/stats/extended` | auth, verified | Full analytics: personal records, trends, consistency score |
| `PUT` | `/my-times/:date` | auth | Always returns 403 (admin-only time editing) |
| `DELETE` | `/my-times/:date/override` | auth | Always returns 403 |
| `GET` | `/timer/forgotten-checkout` | auth, verified | Check if timer has been running too long |
| `POST` | `/timer/forgotten-checkout/finalize` | auth, verified | Accept a corrected end time for a stale timer |
| `POST` | `/timer/forgotten-checkout/discard` | auth, verified | Discard a stale timer without recording time |

---

## Key Route Details

### `POST /timer/stop`

The most complex route. After atomically clearing the timer state from the User document, it:
1. Calculates session seconds (clamped to 0-86400).
2. Increments `TrackingData.seconds` and pushes the session to `sessions`.
3. Detects level-ups by comparing `oldLevel` to new stats.
4. Detects goal-reached events for notification purposes.
5. Calls `recalcUserStats` (stats recalculation).
6. Emits `STATS_UPDATE` and `FRIEND_STATS_UPDATE` via Socket.io.
7. Creates `level_up` and `daily_goal_reached` notifications with push delivery.
8. Calls `checkAndSetGoalMet` to update the streak.
9. Emits `TIMER_SYNC` with `running: false` to all user devices.

### `GET /stats/extended`

Returns a comprehensive analytics payload including:
- Personal records (longest session, best day, best week, best month)
- Level progress
- Week-over-week and month-over-month change percentages
- Consistency score (goal met rate over last 30 non-off days)
- Weekly and monthly goal tracking

---

## Known Issues & Technical Debt

- `POST /tracking` (the manual save endpoint) still exists for backward compatibility but creates potential inconsistency if called alongside the timer start/stop flow. It does not push a session entry.
- The `level_up` notification creates a `titles` lookup array inline. The same array is defined in `utils.js` on the frontend and should be unified.
- The `forgotten-checkout/finalize` flow marks the session as `forgottenCheckout: true` in the sessions array, which is correct, but does not enforce that `correctedEndTime` is on the same calendar day as `startedAt` at the server level (the frontend enforces this via the modal).
