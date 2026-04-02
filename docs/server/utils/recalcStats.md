# server/utils/recalcStats.js

## File Overview

**File path:** `server/utils/recalcStats.js`

Single source of truth for recomputing a user's aggregate statistics (`totalStandingSeconds`, `totalDays`, and `level`) from raw `TrackingData`. The function does a full recalculation on every call — it never increments existing values. Per-day goal overrides (`DailyGoalOverride`) and off-days (`OffDay`) are respected when computing `totalDays`. Streak fields are explicitly **not** computed here; they are maintained exclusively by `server/utils/streaks.js` and are returned from the User document as-is for the convenience of callers.

**Dependencies (internal):**
- `../models/TrackingData`
- `../models/DailyGoalOverride`
- `../models/OffDay`
- `../models/User`
- `./settings` (`getEffectiveGoalMinutes`)

**Side effects when loaded:** None.

---

## Variables & Constants

None at module level.

---

## Functions & Methods

### `recalcUserStats(userId)`

**Signature:** `async function recalcUserStats(userId: string): Promise<{ totalSeconds, totalDays, currentStreak, bestStreak, level } | null>`

**Returns:** An object with the freshly computed `totalSeconds`, `totalDays`, `level` and the unchanged (DB-stored) `currentStreak` and `bestStreak`; or `null` if the user does not exist.

**Description:**
1. Loads the User document; returns `null` if not found.
2. Loads all `TrackingData` for the user and sums `seconds` to get `totalSeconds`.
3. Resolves the user's effective daily goal via `getEffectiveGoalMinutes(user)` (no per-day date passed — gets the baseline goal).
4. Loads all `DailyGoalOverride` entries into a map keyed by date string; the helper `getGoalSecondsForDate` returns the override if present, otherwise falls back to the baseline.
5. Loads all `OffDay` entries into a `Set`.
6. Counts `totalDays` as the number of `TrackingData` records that are **not** off-days and whose `seconds >= getGoalSecondsForDate(date)`.
7. Computes `level` from the cumulative hours using the threshold array `[0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000]` (levels 1–10).
8. Calls `User.updateOne()` to persist `totalStandingSeconds`, `totalDays`, and `level`.
9. Returns the computed values plus the current DB streak values.

**Side effects:** Writes `totalStandingSeconds`, `totalDays`, `level` to the User document.

**Callers:** Every route and socket handler that mutates TrackingData must call this after the mutation — timer stop (`server/socket/handler.js`), admin time edit (`server/routes/admin.js`), user self-service override (`server/routes/api.js`).

---

## Exports

```js
module.exports = { recalcUserStats };
```

| Export | Purpose |
|---|---|
| `recalcUserStats` | Called after any tracking data mutation to keep User stats consistent. |

---

## Known Issues & Technical Debt

- The level thresholds are hardcoded and duplicated in `frontend/src/lib/utils.js` (`levelFromSeconds`). Changes to thresholds must be made in both files. `[DUPLICATE OF: frontend/src/lib/utils.js — consider consolidating into a shared constant or server-side endpoint]`
- The function issues one DB query per field type (User, TrackingData, DailyGoalOverride, OffDay) — for users with large history this is acceptable but could be slow at scale.
- The `getGoalSecondsForDate` helper is defined as a closure inside `recalcUserStats`; it cannot be tested in isolation.
