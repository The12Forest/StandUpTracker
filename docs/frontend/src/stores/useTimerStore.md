# frontend/src/stores/useTimerStore.js

## File Overview

**File path:** `frontend/src/stores/useTimerStore.js`

Zustand store that manages all client-side timer state. The timer is server-authoritative: start and stop operations hit the API, and the client mirrors the result. The elapsed display counter is driven by `requestAnimationFrame` using NTP-corrected timestamps to ensure accurate display even when the client clock drifts from the server clock. Cross-device synchronisation is handled by the `TIMER_SYNC` WebSocket event.

**Dependencies (internal):**
- `../lib/api` (`api`)
- `../lib/utils` (`todayKey`)

**Dependencies (external):**
- `zustand` (`create`)
- `requestAnimationFrame` (browser built-in)

**Side effects when loaded:** None.

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `running` | `boolean` | `false` | Whether the timer is currently active. |
| `startedAt` | `number \| null` | `null` | Client-adjusted start timestamp (ms). Server timestamp minus `ntpOffset`. |
| `elapsed` | `number` | `0` | Display-only seconds for the current session (updated by rAF). |
| `todayTotal` | `number` | `0` | Total seconds tracked today (persisted sessions only). |
| `ntpOffset` | `number` | `0` | Clock offset in ms from the server. Used in `correctedNow()`. |
| `_rafId` | `number \| null` | `null` | Active `requestAnimationFrame` handle. |

---

## Actions

### `correctedNow()`

**Signature:** `correctedNow(): number`

**Returns:** `Date.now() + ntpOffset`

**Description:** Returns a server-clock-corrected "now" timestamp. Used by `_tick` to compute accurate elapsed time.

---

### `start()`

**Signature:** `async start(): Promise<void>`

**Description:** Posts to `POST /api/timer/start`. On success, adjusts `startedAt` by the NTP offset and starts the rAF tick loop. On failure, logs the error. Returns early if already running. Calls `navigator.vibrate(30)` if supported.

---

### `stop()`

**Signature:** `async stop(): Promise<number | undefined>`

**Returns:** Session seconds (from server response) or `undefined` on error.

**Description:** Optimistically cancels the rAF loop and sets `running: false` immediately to prevent double-stop. Posts to `POST /api/timer/stop`. Uses server-provided `todaySeconds` to update `todayTotal` directly. On error, calls `fetchState()` to resync. Calls `navigator.vibrate([20, 50, 20])` if supported.

---

### `_tick()`

**Signature:** `_tick(): void`

**Description:** Internal rAF loop. On each frame, computes `elapsed` as `(correctedNow() - startedAt) / 1000`, updates state, and schedules the next frame via `requestAnimationFrame`. Stops automatically when `running` is `false`.

---

### `fetchState()`

**Signature:** `async fetchState(): Promise<void>`

**Description:** Calls `GET /api/timer/state`. If the server says running but the client does not, starts the rAF loop. If the server says stopped but the client is running, cancels the rAF loop. Errors are silently swallowed.

**Callers:** `useSocketStore.js` (on connect), `TimerPage.jsx` (on mount).

---

### `loadToday()`

**Signature:** `async loadToday(): Promise<void>`

**Description:** Calls `GET /api/tracking?from=today&to=today` and updates `todayTotal` from the response. Handles both object and number response formats. Errors are silently swallowed.

**Callers:** `useSocketStore.js` (on connect), `TimerPage.jsx` (on mount).

---

### `setNtpOffset(offset)`

**Signature:** `setNtpOffset(offset: number): void`

**Description:** Updates the `ntpOffset`. Called by `useNtpSync` after each sync cycle.

---

### `syncFromServer(serverState)`

**Signature:** `syncFromServer(serverState: { running: boolean, startedAt?: number }): void`

**Description:** Called on `TIMER_SYNC` WebSocket events. If the server is running but the client is not, adjusts `startedAt` and starts the rAF loop. If the server is stopped but the client is running, cancels the rAF loop.

---

### `syncStats(stats)`

**Signature:** `syncStats(stats: { todaySeconds?: number }): void`

**Description:** Called on `STATS_UPDATE` WebSocket events. Updates `todayTotal` if `todaySeconds` is present.

---

## Exports

```js
export default useTimerStore;
```

---

## Known Issues & Technical Debt

- `_rafId` is stored in Zustand state, which triggers a re-render on each rAF frame (via `set({ elapsed, _rafId })`). In practice only `elapsed` is subscribed to by components, but the pattern is unusual. A `useRef` or instance variable would be more conventional.
- `_tick` is a store action that calls `set` on every animation frame, which means Zustand subscribers are notified at ~60 fps while the timer is running. Components that subscribe only to `running` are unaffected, but components that subscribe to `elapsed` will re-render at 60 fps.
- The `start()` method does not guard against a race condition where two clicks arrive before the first API response returns; the `if (state.running) return` guard relies on the state being updated synchronously, but Zustand state is not necessarily synchronous across concurrent calls.
