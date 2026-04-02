# frontend/src/App.jsx

## File Overview

**File path:** `frontend/src/App.jsx`

Top-level React component and routing configuration for the SPA. Contains two components:

- **`AppShell`** — the inner component that handles setup-check, auth initialisation, socket connection, hooks registration, and conditional route rendering. It implements a three-state startup flow: checking whether first-time setup is complete → redirecting to `/setup` if not → rendering the full authenticated route tree if setup is done.
- **`App`** (default export) — wraps `AppShell` in a `BrowserRouter`.

**Dependencies (internal):**
- `./stores/useAuthStore`
- `./stores/useSocketStore`
- `./hooks/useNtpSync`
- `./hooks/useDynamicFavicon`
- `./components/ToastContainer`
- `./components/AppLayout`
- All page components: `LoginPage`, `RegisterPage`, `TimerPage`, `DashboardPage`, `LeaderboardPage`, `AdminPage`, `SettingsPage`, `SocialPage`, `GroupsPage`, `StreaksPage`, `AdminUserTimePage`, `SchedulerPage`, `SetupPage`, `TwoFactorSetupPage`

**Dependencies (external):**
- `react` (`useEffect`, `useState`)
- `react-router-dom` (`BrowserRouter`, `Routes`, `Route`, `Navigate`)

**Side effects when mounted:**
- Fetches `/api/setup/status` on mount to determine setup completion.
- Calls `useAuthStore.init()` once setup is confirmed complete.
- Calls `useSocketStore.connect()` once the user is authenticated.
- Mounts `useNtpSync` and `useDynamicFavicon` hooks globally.

---

## Variables & Constants

None at module level.

---

## Functions & Methods

### `AppShell`

**Signature:** `function AppShell(): JSX.Element`

**Description:** Renders the full application shell. On mount, fetches `/api/setup/status` and stores the result in local `setupComplete` state. While the result is pending, renders a full-screen loading spinner. If setup is incomplete, renders only the `/setup` route (all other paths redirect to `/setup`). If setup is complete:

- Renders `<ToastContainer>` globally.
- If `user.needs2faSetup` is true, renders only `/2fa-setup` (all other paths redirect there).
- Otherwise renders the authenticated layout under `<AppLayout>` with all protected routes, plus public `/login` and `/register` routes.

**Route structure (when setup complete and 2FA not required):**

| Path | Component | Notes |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/register` | `RegisterPage` | Public |
| `/setup` | Redirect → `/app` | Setup already done |
| `/app` | `TimerPage` | Inside `AppLayout` |
| `/dashboard` | `DashboardPage` | Inside `AppLayout` |
| `/leaderboard` | `LeaderboardPage` | Inside `AppLayout` |
| `/friends` | `SocialPage` | Inside `AppLayout` |
| `/groups` | `GroupsPage` | Inside `AppLayout` |
| `/streaks` | `StreaksPage` | Inside `AppLayout` |
| `/scheduler` | `SchedulerPage` | Inside `AppLayout` |
| `/settings` | `SettingsPage` | Inside `AppLayout` |
| `/admin` | `AdminPage` | Inside `AppLayout` |
| `/admin/user/:userId/times` | `AdminUserTimePage` | Inside `AppLayout` |
| `*` | Redirect → `/app` | Catch-all |

---

### `App` (default export)

**Signature:** `function App(): JSX.Element`

**Description:** Wraps `AppShell` in `<BrowserRouter>` to provide routing context to the entire component tree.

---

## Exports

| Export | Description |
|---|---|
| `default App` | Root component — mounted by `main.jsx`. |

---

## Known Issues & Technical Debt

- The setup status check (`/api/setup/status`) uses a plain `fetch` rather than the typed `api()` client, so errors are caught with `.catch(() => setSetupComplete(true))` — this means a network failure is indistinguishable from a completed setup, potentially exposing an unconfigured app.
- All 14 page components are eagerly imported; there is no code splitting / lazy loading. For a large app this increases initial bundle size.
