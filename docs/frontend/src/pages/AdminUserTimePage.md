# frontend/src/pages/AdminUserTimePage.jsx

## File Overview

**File path:** `frontend/src/pages/AdminUserTimePage.jsx`

Admin sub-page for editing a specific user's daily standing times, goal overrides, and off-day flags. Accessed from `AdminPage` → Users tab → "Edit Times" action. Uses the `userId` route parameter to load a full date range of tracking data. All edits are debounced and auto-saved. A "Show All Days" toggle filters to only days with recorded activity.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../stores/useToastStore`

**Dependencies (external):**
- `react` (`useEffect`, `useState`, `useRef`)
- `react-router-dom` (`useParams`, `useNavigate`)
- `lucide-react` (`ArrowLeft`, `Clock`, `Check`, `Loader2`, `X`, `Calendar`, `Pencil`, `RotateCcw`, `Eye`, `EyeOff`, `Coffee`, `Flag`, `Undo2`, `AlertTriangle`)

**Side effects when mounted:** Calls `GET /api/admin/users/:userId/daily-times`.

---

## State

| Field | Description |
|---|---|
| `data` | Full API response: tracking map, override map, off-day map, date range, user info. |
| `loading` | Loading flag. |
| `savingRows` | Map of `date`→`boolean` for per-row save spinners. |
| `savedRows` | Map of `date`→`boolean` for per-row success indicators. |
| `localOverrides` | Local goal override minutes map (optimistic). |
| `localTimes` | Local edited seconds map (optimistic). |
| `localOffDays` | Local off-day boolean map (optimistic). |
| `reportClearedMap` | Map of dates that have had report flags cleared. |
| `showAllDays` | Toggle: show all dates or only dates with data. |

---

## Key Functions

### `formatMinutesDisplay(seconds)` (private)

Formats seconds into `"Xh Ym"` or `"Ym"` display string for the time column.

### `saveOverride(date, goalMinutes)`

PUT `/api/admin/users/:userId/daily-goal/:date` — saves a goal override for a specific day.

### `saveTime(date, minutes)`

PUT `/api/admin/users/:userId/time/:date` — saves an edited time value (converts minutes to seconds).

### `resetTime(date)`

DELETE `/api/admin/users/:userId/time/:date/override` — resets a manually edited time back to original.

### `toggleOffDay(date, isOff)`

PUT or DELETE `/api/admin/users/:userId/off-day/:date` — toggles a day as an off-day.

### `clearReport(date)`

POST `/api/admin/users/:userId/reports/:date/clear` — clears a flagged report for a day.

---

## Exports

| Export | Description |
|---|---|
| `default AdminUserTimePage` | Mounted at `/admin/user/:userId/times` in `App.jsx`. Back button navigates to `/admin?tab=users`. |

---

## Known Issues & Technical Debt

- Debounce timers (`debounceTimers` and `timeDebounceTimers`) are ref-stored but only one set is defined; time edits and goal override edits use separate ref objects, which is correct, but the code is verbose. Consider a generic debounce utility.
- `formatMinutesDisplay` is a local helper duplicated across pages. `[DUPLICATE — consider extracting to utils.js]`
