# frontend/src/pages/AdminPage.jsx

## File Overview

**File path:** `frontend/src/pages/AdminPage.jsx`

The admin control panel page. Uses URL-based tab state (`?tab=...`) for deep-linking and back-navigation. Renders six tabbed sections: Overview, Statistics, Users, Logs, Settings, and Audit Log. Each tab is a separate sub-component that loads its own data independently. Only users with `admin` or `super_admin` roles should reach this page (enforced server-side; the frontend relies on `AppLayout` for auth gating and the admin backend for authorisation).

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`, `BentoGrid`, `StatCard`)
- `../stores/useToastStore`
- `../stores/useAuthStore`

**Dependencies (external):**
- `react` (`useEffect`, `useState`, `useCallback`)
- `react-router-dom` (`useNavigate`, `useSearchParams`)
- `lucide-react` (many icons)
- `react-chartjs-2` (`Bar`)
- `chart.js` (registered: `CategoryScale`, `LinearScale`, `BarElement`, `Title`, `Tooltip`, `Legend`)

**Side effects when mounted:** Each active tab fetches its own data from the admin API endpoints.

---

## Tab Components

### `AdminPage()` (default export)

Reads and writes `?tab=` from `useSearchParams`. Renders the tab bar and conditionally renders one sub-component per active tab.

| Tab ID | Component | Description |
|---|---|---|
| `overview` | `OverviewTab` | Server stats, user counts, uptime, memory, recent activity. Auto-refreshes every 30 s. |
| `statistics` | `StatisticsTab` | Aggregated usage statistics and charts. |
| `users` | `UsersTab` | User management: search, role change, ban, reset password, impersonate, delete, verify email, manage 2FA, view daily times. |
| `logs` | `LogsTab` | System logs with level filtering and search. |
| `settings` | `SettingsTab` | Admin settings management: SMTP, JWT, AI config, feature flags, enforcement settings, VAPID keys. |
| `config` | `ConfigTab` | Audit log viewer (labelled "Audit Log" in the UI, `config` in the URL parameter). |

### Key helper functions (inside `OverviewTab`)

- `formatBytes(bytes)` — converts bytes to B/KB/MB/GB/TB string.
- `formatUptime(secs)` — converts seconds to `Xd Xh Xm` string.
- `formatHours(secs)` — converts seconds to `Xh Xm` string.
- `pct(a, b)` — computes percentage.

---

## Exports

| Export | Description |
|---|---|
| `default AdminPage` | Mounted at `/admin` in `App.jsx`. |

---

## Known Issues & Technical Debt

- All six tab sub-components are defined in the same file, making the file very large. Consider splitting into separate files per tab.
- The `OverviewTab` auto-refresh uses `setInterval(loadStats, 30000)` but does not cancel it if the tab changes while the interval is active; the interval is cleared by the cleanup function only when the component unmounts.
- `formatBytes`, `formatUptime`, and `formatHours` are local helpers duplicated from similar functions in other pages. `[DUPLICATE — consider extracting to `frontend/src/lib/utils.js`]`
