# frontend/src/pages/StreaksPage.jsx

## File Overview

**File path:** `frontend/src/pages/StreaksPage.jsx`

Dedicated streaks overview page. Displays the user's personal streak, all friend streaks with current/best values and "today's progress" indicators, and all group streaks. Reacts to `FRIEND_STREAK_UPDATE` and `GROUP_STREAK_UPDATE` socket events to refresh data in real time. Today's minutes display is a live sum of `todayTotal` and the running `elapsed` from `useTimerStore`.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`, `BentoGrid`)
- `../stores/useAuthStore`
- `../stores/useTimerStore`
- `../stores/useSocketStore`

**Dependencies (external):**
- `react` (`useState`, `useEffect`, `useCallback`)
- `lucide-react` (`Flame`, `Users`, `User`, `Check`, `Clock`, `Trophy`, `TrendingUp`)

**Side effects when mounted:** Fetches friend streaks and groups from the API.

---

## Key Data

- `friendStreaks` — from `GET /api/social/streaks` — array of streak objects with both users' info, currentStreak, bestStreak, and today's progress.
- `groups` — from `GET /api/groups` — array of groups with currentStreak.
- `thresholdMinutes` — the streak threshold for today's progress indicators.
- `todayMinutes` — live: `Math.round((todayTotal + elapsed) / 60)`.

---

## Exports

| Export | Description |
|---|---|
| `default StreaksPage` | Mounted at `/streaks` in `App.jsx`. |

---

## Known Issues & Technical Debt

- Socket event listeners are registered using `useSocketStore.getState().on()` and `off()` directly (not via the hook's reactive API), which means if the socket reconnects the listeners are not automatically re-registered. The `useEffect` dependency array only includes `loadStreaks`, not the socket instance itself.
