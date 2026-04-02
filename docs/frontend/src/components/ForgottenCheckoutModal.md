# frontend/src/components/ForgottenCheckoutModal.jsx

## File Overview

**File path:** `frontend/src/components/ForgottenCheckoutModal.jsx`

A modal dialog presented to the user when a "forgotten checkout" is detected — i.e. the timer has been running unattended for longer than the threshold (typically 8 hours). The user can either provide a corrected end time (time picker, restricted to the same calendar day as start) and save the session, or discard the session entirely. A confirmation dialog guards the discard action.

**Dependencies (internal):**
- `../stores/useToastStore`

**Dependencies (external):**
- `react` (`useState`)
- `lucide-react` (`AlertTriangle`, `Clock`, `X`, `Trash2`, `Check`)

**Side effects when mounted:** None.

---

## Variables & Constants

None at module level.

---

## Functions & Methods

### `formatDateTime(ts)` (private)

**Signature:** `function formatDateTime(ts: number): string`

**Returns:** Localised date-time string (e.g. "Apr 1, 09:30 AM") using `Date.toLocaleString`.

---

### `formatDuration(ms)` (private)

**Signature:** `function formatDuration(ms: number): string`

**Returns:** Human-readable duration: `"Xh Ym"` for periods with hours, `"Ym"` for less than one hour.

---

### `ForgottenCheckoutModal({ forgotten, onFinalize, onDiscard, onClose })` (default export)

**Signature:** `export default function ForgottenCheckoutModal({ forgotten, onFinalize, onDiscard, onClose }): JSX.Element`

**Props:**

| Prop | Type | Description |
|---|---|---|
| `forgotten` | `object` | Forgotten session data: `{ startedAt, elapsedMs, thresholdHours }` from the API. |
| `onFinalize` | `(correctedEndISO: string) => Promise<void>` | Callback to save the session with a corrected end time. |
| `onDiscard` | `() => Promise<void>` | Callback to discard the session. |
| `onClose` | `() => void` | Callback to close the modal without action. |

**Description:**
- Computes a default end time as the minimum of `startedAt + thresholdHours` and end-of-start-day (23:59), capped at `Date.now()`.
- Presents a time picker (hours:minutes only) locked to the same calendar day as `startedAt`; the date portion is read-only and visually disabled.
- Validates that the corrected end time is after `startedAt` and not in the future; shows an inline error if invalid.
- Displays a live session duration preview while the time picker has a valid value.
- "Save & Finalize" button is disabled while `saving` or the end time is invalid.
- "Discard Session" triggers a browser `confirm()` dialog before calling `onDiscard`.
- Both actions set `saving: true` during the async operation and show success/error toasts via `useToastStore`.

**Side effects:** Calls `onFinalize` or `onDiscard` (which make API calls); shows toasts; calls `onClose` on success.

**Callers:** `TimerPage.jsx`, `SchedulerPage.jsx`.

---

## Exports

| Export | Description |
|---|---|
| `default ForgottenCheckoutModal` | Used wherever forgotten checkout resolution is needed. |

---

## Known Issues & Technical Debt

- Uses `window.confirm()` for the discard confirmation, which blocks the UI thread and cannot be styled. A custom modal confirmation would be more consistent with the app's design.
- `formatDateTime` and `formatDuration` are private helper functions duplicated across multiple pages (similar helpers exist in `DashboardPage`, `AdminUserTimePage`). `[DUPLICATE — consider extracting to `frontend/src/lib/utils.js`]`
