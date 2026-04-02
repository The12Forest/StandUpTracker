# frontend/src/pages/LeaderboardPage.jsx

## File Overview

**File path:** `frontend/src/pages/LeaderboardPage.jsx`

The competitive leaderboard page. Shows ranked standing times for four selectable periods (Today, This Week, This Month, All Time). Entries with a running timer display a live-incrementing time cell. Users can report suspicious sessions via a modal. The leaderboard refreshes automatically on each Socket.io `STATS_UPDATE` event.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../lib/utils` (`formatTime`)
- `../stores/useSocketStore`
- `../stores/useAuthStore`
- `../stores/useToastStore`

**Dependencies (external):**
- `react` (`useEffect`, `useState`, `useCallback`, `useRef`)
- `lucide-react` (`Trophy`, `Medal`, `Clock`, `Flame`, `Flag`, `Timer`, `Calendar`)

**Side effects when mounted:** Fetches leaderboard data. Registers a `STATS_UPDATE` socket listener to auto-refresh.

---

## Variables & Constants

| Constant | Description |
|---|---|
| `PERIODS` | Four period options: `today`, `week`, `month`, `all`. |

---

## Sub-Components

### `useLiveElapsed(timerStartedAt, running)` (private hook)

Returns live-incrementing elapsed seconds for a running leaderboard entry. Uses `setInterval(1000)` to recompute from `Date.now() - new Date(timerStartedAt)`. Cleans up on unmount or when `running` changes.

### `LiveTimeCell({ totalSeconds, timerRunning, timerStartedAt })` (private)

Renders the time cell for a leaderboard entry, adding live elapsed seconds to `totalSeconds` when `timerRunning` is true.

### `periodHeader(period)` (private)

Returns a human-readable header string for the selected period (e.g. "Week of Apr 1" or the full date for today).

---

## Key Functions

- `load()` — fetches `GET /api/leaderboard?period=...` and updates `entries`. Respects a 1-second debounce ref to avoid rapid refetches on period changes.
- `handleReport(session)` — opens the report modal for a specific leaderboard entry.
- `submitReport()` — POSTs to `POST /api/reports` with the selected reason.

---

## Exports

| Export | Description |
|---|---|
| `default LeaderboardPage` | Mounted at `/leaderboard` in `App.jsx`. |

---

## Known Issues & Technical Debt

- Live elapsed in `useLiveElapsed` uses `Date.now()` (client clock) rather than an NTP-corrected timestamp, so it may diverge from the server's elapsed value over time.
- The 1-second `loadRef` debounce uses a ref directly mutated in the closure rather than a proper debounce utility.
