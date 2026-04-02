# frontend/src/pages/TimerPage.jsx

## File Overview

**File path:** `frontend/src/pages/TimerPage.jsx`

The primary timer page — the app's home screen (`/app`). Displays a large session elapsed counter, today's total time, goal progress, current streak, level information, and start/stop controls. A forgotten checkout banner appears at the top if a forgotten session is detected, opening `ForgottenCheckoutModal` when clicked.

**Dependencies (internal):**
- `../stores/useTimerStore`
- `../stores/useAuthStore`
- `../components/BentoCard` (`BentoCard`, `BentoGrid`, `StatCard`)
- `../lib/utils` (`formatTime`, `formatMinutes`, `levelFromSeconds`)
- `../hooks/useForgottenCheckout`
- `../components/ForgottenCheckoutModal`

**Dependencies (external):**
- `react` (`useEffect`, `useState`)
- `lucide-react` (`Play`, `Square`, `Clock`, `Flame`, `Target`, `TrendingUp`, `AlertTriangle`)

**Side effects when mounted:** Calls `loadToday()` and `fetchState()` to synchronise timer state on page entry.

---

## Key State

- `showForgottenModal` — controls visibility of `ForgottenCheckoutModal`.
- `forgotten` — from `useForgottenCheckout`.

---

## Derived Values

| Value | Calculation |
|---|---|
| `displaySeconds` | `running ? todayTotal + elapsed : todayTotal` — total display seconds including live session. |
| `goalProgress` | `Math.min(100, (displaySeconds / (goalMinutes * 60)) * 100)` — percentage of daily goal. |
| `lvl` | `levelFromSeconds(user.totalStandingSeconds)` — level metadata object. |

---

## Layout Sections

1. **Forgotten checkout banner** (conditional): warning strip that opens the modal.
2. **Timer Hero card** (pulsing when running): large mono elapsed display, today's total, optional streak + goal progress info while running, Start/Stop button.
3. **Stat cards (BentoGrid)**: Today's time, Streak (current/best), Level (title/progress bar), Goal progress.

---

## Exports

| Export | Description |
|---|---|
| `default TimerPage` | Mounted at `/app` in `App.jsx`. |

---

## Known Issues & Technical Debt

None identified. The page is simple and delegates complex logic to the stores and hooks.
