# frontend/src/components/Sidebar.jsx

## File Overview

**File path:** `frontend/src/components/Sidebar.jsx`

The primary navigation sidebar for the application. On large screens it is sticky and always visible; on mobile it slides in from the left when a hamburger button is tapped, with a dark overlay behind it. Shows the connection status indicator, navigation links (including an Admin link for admins/super_admins), user avatar, username, role, and a sign-out button.

**Dependencies (internal):**
- `../stores/useAuthStore`
- `../stores/useSocketStore`

**Dependencies (external):**
- `react-router-dom` (`NavLink`, `useNavigate`)
- `react` (`useState`)
- `lucide-react` (`Timer`, `BarChart3`, `Trophy`, `Settings`, `Shield`, `LogOut`, `Menu`, `X`, `Users`, `UsersRound`, `Flame`, `CalendarDays`)

**Side effects when mounted:** None.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `NAV_ITEMS` | `Array<{ to, icon, label }>` | Static navigation link definitions for all 8 main routes: Timer (`/app`), Stats (`/dashboard`), Board (`/leaderboard`), Friends (`/friends`), Groups (`/groups`), Streaks (`/streaks`), Scheduler (`/scheduler`), Settings (`/settings`). |

---

## Functions & Methods

### `Sidebar()` (default export)

**Signature:** `export default function Sidebar(): JSX.Element`

**Description:**
- Local `open` state controls mobile slide-in visibility.
- `isAdmin` derived from `user.role` (admin or super_admin).
- `handleLogout`: calls `disconnect()` (socket), `logout()` (auth store), and `navigate('/login')`.
- `linkClass`: returns active or inactive Tailwind classes for `NavLink` depending on `isActive`.
- Renders:
  - **Mobile toggle button** (hamburger/X, fixed top-left, visible on `< lg` screens).
  - **Mobile overlay** (dark background behind sidebar, closes sidebar on click).
  - **Sidebar `<aside>`**: translates off-screen on mobile when closed; always visible on `lg+`.
    - Logo area: StandUpTracker brand + connection status dot (green = synced, red = offline).
    - Navigation: maps `NAV_ITEMS` with `NavLink`; conditionally adds Admin link.
    - User footer: avatar initial, username, role label, sign-out button.

**Side effects:** `handleLogout` disconnects the socket, clears auth state, and navigates to `/login`.

**Callers:** `AppLayout.jsx`.

---

## Exports

| Export | Description |
|---|---|
| `default Sidebar` | Rendered inside `AppLayout`. |

---

## Known Issues & Technical Debt

- The sidebar has no keyboard trap when open on mobile (pressing Tab can navigate to off-screen content behind the overlay). Accessibility could be improved with a focus trap.
- Moderators are not in the `isAdmin` check (`['admin', 'super_admin'].includes(user.role)`), which is consistent with the backend role model but means moderators have no visible admin link even if they have some elevated permissions.
