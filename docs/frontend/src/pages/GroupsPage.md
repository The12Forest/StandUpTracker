# frontend/src/pages/GroupsPage.jsx

## File Overview

**File path:** `frontend/src/pages/GroupsPage.jsx`

Groups management page with three tabs: "My Groups", "Invitations", and "Create". Allows users to view their groups (with expandable member leaderboards), accept/decline group invitations, and create new groups. Group detail panels show member standings sorted by a configurable criterion (weekly time, total time, level, or streak). The component listens for `GROUP_STREAK_UPDATE` socket events to live-refresh streak data.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../stores/useToastStore`
- `../stores/useSocketStore`
- `../stores/useAuthStore`

**Dependencies (external):**
- `react` (`useState`, `useEffect`, `useCallback`, `useRef`)
- `lucide-react` (`Users`, `UserPlus`, `Crown`, `LogOut`, `Trash2`, `Plus`, `Check`, `X`, `Flame`, `Clock`, `Search`, `Trophy`, `ChevronDown`)

**Side effects when mounted:** Fetches groups and invitations from the API.

---

## Variables & Constants

| Constant | Description |
|---|---|
| `TABS` | Three tab definitions: `groups`, `invites`, `create`. |
| `CRITERIA` | Four sort criteria for the member leaderboard: `weeklyTime`, `totalTime`, `level`, `streak`. |
| `RANK_COLORS` | Tailwind text colours for rank positions 1–3 (gold, silver, bronze). |

---

## Key Functions

- `formatHm(secs)` — local time formatter. `[DUPLICATE — also in DashboardPage, AdminPage]`
- `criterionValue(member, criterion)` — returns the display value for a member under the selected sort criterion.
- `criterionSuffix(criterion)` — returns the unit suffix string for the criterion.
- `loadGroups()` / `loadInvites()` — fetch groups and invitations from the API.
- `loadDetail(groupId)` — fetches full group detail including member standings.
- `handleCreate()` — POSTs to create a new group.
- `handleInvite(groupId, username)` — POSTs a group invitation.
- `handleAccept(groupId)` / `handleDecline(groupId)` — accepts or declines a group invitation.
- `handleLeave(groupId)` — leaves a group (with `window.confirm` guard).
- `handleDelete(groupId)` — deletes a group (owner only, with `window.confirm` guard).

---

## Exports

| Export | Description |
|---|---|
| `default GroupsPage` | Mounted at `/groups` in `App.jsx`. |

---

## Known Issues & Technical Debt

- `formatHm` is a local duplicate. `[DUPLICATE OF: DashboardPage.jsx, AdminPage.jsx — extract to utils.js]`
- Uses `window.confirm()` for leave/delete confirmations. `[DUPLICATE OF: ForgottenCheckoutModal confirm pattern]`
- The invite input uses a `useRef`-based search but the actual invite fires on a separate button click — the search state is stored in component state, creating a slight inconsistency.
