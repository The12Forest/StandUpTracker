# frontend/src/pages/DashboardPage.jsx

## File Overview

**File path:** `frontend/src/pages/DashboardPage.jsx`

The statistics and analytics dashboard. Displays a GitHub-style activity heatmap, bar chart of the last 30 days, weekly/monthly aggregates, streak and level cards, trend indicators (week-over-week percentage change), a predictive goal forecast, and an AI advice card powered by Ollama. The AI advice card shows a cooldown countdown timer when the advice endpoint is in its cooldown window.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`, `BentoGrid`)
- `../components/GitHubHeatmap`
- `../lib/utils` (`daysAgo`, `formatMinutes`, `predictDailyGoal`)
- `../stores/useAuthStore`

**Dependencies (external):**
- `react` (`useEffect`, `useState`, `useMemo`, `useCallback`)
- `lucide-react` (many icons)
- `react-chartjs-2` (`Bar`)
- `chart.js` (registered: `CategoryScale`, `LinearScale`, `BarElement`, `Tooltip`)
- `react-markdown` (`ReactMarkdown`)

**Side effects when mounted:** Fetches tracking history (365 days), off-days, user stats, and extended stats. Fetches cached AI advice.

---

## Sub-Components

### `CooldownTimer({ nextRefreshAt, onReady })` (private)

Renders a live countdown (`M:SS`) to when the AI advice can next be refreshed. Calls `onReady()` when the timer reaches zero. Self-clears its interval on unmount.

### `ChangeIndicator({ value })` (private)

Renders a coloured percentage change indicator: green `ArrowUpRight` for positive, red `ArrowDownRight` for negative, grey `Minus` for zero.

---

## Key Data Fetches

| Endpoint | Purpose |
|---|---|
| `GET /api/tracking?from=365dAgo&to=today` | Full year of tracking data for heatmap and charts. |
| `GET /api/tracking/off-days` | Off-day dates for heatmap rendering. |
| `GET /api/auth/me` | Current user stats (streak, level, total). |
| `GET /api/admin/users/:id/stats` (if admin) or `GET /api/auth/extended-stats` | Extended stats for week/month aggregates. |
| `GET /api/ai/advice` | Cached AI advice text. |
| `POST /api/ai/advice` | Generate fresh AI advice (subject to cooldown). Returns 429 with `retryAfterSeconds` on cooldown. |

---

## Exports

| Export | Description |
|---|---|
| `default DashboardPage` | Mounted at `/dashboard` in `App.jsx`. |

---

## Known Issues & Technical Debt

- `formatHm` (formats seconds to `Xh Ym`) is a local helper that is duplicated in `GroupsPage.jsx` and `AdminPage.jsx`. `[DUPLICATE — consider extracting to utils.js]`
- The AI advice request error handling inspects `err.status === 429` to detect cooldown; this pattern relies on the `api()` client attaching `.status` to thrown errors, which is documented but not type-safe.
