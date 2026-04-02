# server/routes/leaderboard.js

## File Overview

**File path:** `server/routes/leaderboard.js`

Implements the public global leaderboard endpoint. Returns ranked users for a given time period (`all`, `week`, `month`, `today`) sorted by total standing seconds. For the `today` period, users with active timers who have not yet stopped their session are appended. No authentication is required.

**Dependencies (internal):**
- `../models/TrackingData`
- `../models/User`
- `../utils/settings` (`getSetting`)

**Dependencies (external):**
- `express`

---

## Functions & Methods

### `getWeekStart(firstDay)`

**Signature:** `function getWeekStart(firstDay: 'monday' | 'sunday'): string`

**Description:** Calculates the ISO date string of the first day of the current week based on the `firstDayOfWeek` setting. Returns a YYYY-MM-DD string.

**Called by:** `GET /` handler when `period === 'week'`.

---

### `getMonthStart()`

**Signature:** `function getMonthStart(): string`

**Description:** Returns the YYYY-MM-DD string for the first day of the current month.

**Called by:** `GET /` handler when `period === 'month'`.

---

## Route Summary

### `GET /`

**Auth:** Public (no authentication required)

**Query params:**
- `period` — `'all'` (default), `'week'`, `'month'`, `'today'`
- `limit` — integer, max 200 (default 50)

**Description:** Aggregates TrackingData by userId for the requested period, joins with the User collection to get usernames and live timer state, and returns a ranked array. Only active, non-deleted users are included. For the `today` period, users with `timerRunning: true` who have no tracking record yet are appended with `totalSeconds: 0` so they appear in the leaderboard even before stopping their timer.

**Returns:** Array of `{ rank, userId, username, level, totalSeconds, totalDays, totalHours, timerRunning, timerStartedAt, currentStreak }`

---

## Known Issues & Technical Debt

- The leaderboard endpoint is public and unauthenticated. This exposes usernames and activity data to unauthenticated users. A `friendRequestsEnabled`-style setting to control leaderboard visibility might be desirable.
- For `period === 'all'`, the aggregation pipeline scans the entire `TrackingData` collection with no date filter, which can be slow on large deployments.
