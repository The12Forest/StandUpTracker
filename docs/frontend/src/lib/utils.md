# frontend/src/lib/utils.js

## File Overview

**File path:** `frontend/src/lib/utils.js`

Collection of pure utility functions used across multiple frontend components and pages. Covers time formatting, date helpers, the level/XP system computation, and a predictive analytics helper for daily goal forecasting. All functions are stateless and have no side effects.

**Dependencies (internal):** None.

**Dependencies (external):** None (uses `Date` built-ins only).

**Side effects when loaded:** None.

---

## Functions & Methods

### `formatTime(totalSeconds)`

**Signature:** `export function formatTime(totalSeconds: number): string`

**Returns:** A zero-padded `HH:MM:SS` string.

**Description:** Converts a total seconds value into a human-readable clock format. Used in the timer display and leaderboard.

**Callers:** `TimerPage.jsx`, `LeaderboardPage.jsx`, `useTimerStore.js`.

---

### `formatMinutes(totalSeconds)`

**Signature:** `export function formatMinutes(totalSeconds: number): number`

**Returns:** Total seconds rounded to the nearest minute.

**Description:** Simple convenience wrapper used in timer progress displays.

**Callers:** `TimerPage.jsx`, `DashboardPage.jsx`.

---

### `todayKey()`

**Signature:** `export function todayKey(): string`

**Returns:** Today's date as `YYYY-MM-DD`.

**Callers:** `useTimerStore.js` (`loadToday`).

---

### `daysAgo(n)`

**Signature:** `export function daysAgo(n: number): string`

**Returns:** The date `n` days before today as `YYYY-MM-DD`.

**Callers:** `DashboardPage.jsx`.

---

### `levelFromSeconds(totalSeconds)`

**Signature:** `export function levelFromSeconds(totalSeconds: number): { level: number, title: string, next: number, progress: number }`

**Returns:** An object with:
- `level` (1–10): current level number.
- `title`: human-readable level title (e.g. `'Veteran'`).
- `next`: seconds required for the next level (or `Infinity` at max level).
- `progress`: fractional progress toward the next level (0–1, clamped).

**Description:** Uses the threshold array `[0, 5, 15, 30, 60, 100, 200, 500, 1000, 2000]` hours and title array `['Beginner', 'Starter', 'Regular', 'Dedicated', 'Veteran', 'Champion', 'Legend', 'Titan', 'Mythic', 'Eternal']`. Levels exceed the array at 10; fallback title is `'Master'`.

**Technical Debt:** Level thresholds are duplicated in `server/utils/recalcStats.js`. `[DUPLICATE OF: server/utils/recalcStats.js — consider a shared constant]`

**Callers:** `TimerPage.jsx`, `DashboardPage.jsx`.

---

### `predictDailyGoal(history, goalMinutes?)`

**Signature:** `export function predictDailyGoal(history: Array<{seconds: number}>, goalMinutes?: number = 30): { avgSeconds, trendSeconds, predictedSeconds, willMeetGoal, confidence } | null`

**Returns:** A prediction object or `null` if `history` has fewer than 3 entries.

**Description:** Analyses up to the last 14 days of tracking history. Computes a rolling average (`avgSeconds`) and, if 14+ days are available, a trend delta (`trendSeconds`) comparing the first 7 vs last 7 days. The predicted value blends the average with 30% of the trend. `confidence` is `Math.min(1, recent.length / 14)` — full confidence requires 14 days.

**Callers:** `DashboardPage.jsx`.

---

## Exports

All functions are named exports.

---

## Known Issues & Technical Debt

- `levelFromSeconds` level thresholds are duplicated in `server/utils/recalcStats.js`. `[DUPLICATE OF: server/utils/recalcStats.js]`
- `predictDailyGoal` uses a simple linear trend; no seasonality or weekday adjustment is applied, so Monday predictions after a weekend of no standing may be misleading.
