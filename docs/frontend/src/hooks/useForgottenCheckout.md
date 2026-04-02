# frontend/src/hooks/useForgottenCheckout.js

## File Overview

**File path:** `frontend/src/hooks/useForgottenCheckout.js`

Custom React hook that detects and resolves "forgotten checkout" situations — cases where a user left the timer running for longer than the configured threshold (e.g. 8 hours) without stopping it. On mount (and whenever the user changes), it calls the server to check for a forgotten session. It exposes the forgotten session data and two resolution actions: `finalize` (save with a corrected end time) and `discard` (delete the session). The hook is used by both `TimerPage` and `SchedulerPage`.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../stores/useAuthStore`

**Dependencies (external):**
- `react` (`useState`, `useEffect`, `useCallback`)

**Side effects when mounted:** Calls `GET /api/timer/forgotten-checkout`.

---

## Variables & Constants

None at module level.

---

## Functions & Methods

### `useForgottenCheckout()` (default export)

**Signature:** `export default function useForgottenCheckout(): { forgotten, check, finalize, discard }`

**Returns:** An object with four fields:

| Field | Type | Description |
|---|---|---|
| `forgotten` | `null \| false \| object` | `null` while loading, `false` if no forgotten checkout, or the forgotten session data object (includes `startedAt`, `elapsedMs`, `thresholdHours`). |
| `check` | `() => Promise<void>` | Re-runs the forgotten checkout check. |
| `finalize` | `(correctedEndTime: string) => Promise<any>` | POSTs to `/api/timer/forgotten-checkout/finalize` with the corrected ISO end time string. Sets `forgotten` to `false` on completion. |
| `discard` | `() => Promise<any>` | POSTs to `/api/timer/forgotten-checkout/discard`. Sets `forgotten` to `false` on completion. |

**Description:** The `check` callback is memoised with `useCallback` and re-created when `user` changes. It is called automatically via `useEffect` on mount and user change. If no user is logged in, `forgotten` is set to `false` immediately.

**Side effects:**
- `check`: calls `GET /api/timer/forgotten-checkout`.
- `finalize`: calls `POST /api/timer/forgotten-checkout/finalize`.
- `discard`: calls `POST /api/timer/forgotten-checkout/discard`.

**Callers:** `TimerPage.jsx`, `SchedulerPage.jsx`.

---

## Exports

| Export | Description |
|---|---|
| `default useForgottenCheckout` | Used by `TimerPage` and `SchedulerPage` to surface and resolve forgotten checkout prompts. |

---

## Known Issues & Technical Debt

- `finalize` and `discard` do not have try/catch wrappers; errors propagate to the caller (`ForgottenCheckoutModal`) which is responsible for catching them and showing toast messages. This is intentional but not documented in JSDoc.
- The initial loading state (`null`) requires callers to handle three distinct states (`null`/`false`/object), which is slightly unusual compared to the common `{ data, loading, error }` pattern.
