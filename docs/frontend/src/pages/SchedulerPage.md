# frontend/src/pages/SchedulerPage.jsx

## File Overview

**File path:** `frontend/src/pages/SchedulerPage.jsx`

Weekly schedule view that shows all group members' session activity in an hourly grid for each day of the week. Users can navigate between weeks with prev/next buttons. The page also surfaces the "forgotten checkout" modal when a forgotten session is detected. It supports viewing personal sessions alongside group members' sessions, with each member colour-coded.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../stores/useAuthStore`
- `../stores/useSocketStore`
- `../stores/useToastStore`
- `../hooks/useForgottenCheckout`
- `../components/ForgottenCheckoutModal`

**Dependencies (external):**
- `react` (`useEffect`, `useState`, `useCallback`, `useMemo`)
- `lucide-react` (`ChevronLeft`, `ChevronRight`, `Calendar`, `Coffee`, `CoffeeIcon`, `UsersRound`, `User`, `AlertTriangle`)

**Side effects when mounted:** Fetches scheduler data for the current week.

---

## Variables & Constants

| Constant | Description |
|---|---|
| `HOURS` | Array 0–23 for the hourly grid rows. |
| `MEMBER_COLORS` / `MEMBER_BORDERS` | 10 colour variants for member session blocks. |

---

## Key Functions

- `getWeekStart(date, firstDay)` — returns the ISO date of the Monday (or Sunday) that starts the given date's week.
- `getWeekDays(weekStart)` — returns an array of 7 ISO date strings for the week.
- `formatHour(h)` — formats an hour integer as `"HH:00"`.
- Session block rendering: each session in the API response is a `{ startHour, durationHours, userId, username }` object; rendered as a coloured bar in the grid at the appropriate row (hour) and column (day).

---

## Exports

| Export | Description |
|---|---|
| `default SchedulerPage` | Mounted at `/scheduler` in `App.jsx`. |

---

## Known Issues & Technical Debt

- `CoffeeIcon` is imported but appears to be a duplicate of `Coffee` from lucide-react. `[CANDIDATE FOR REMOVAL — duplicate icon import]`
- Sessions that cross midnight are not handled; they would appear truncated at `hour 23`.
