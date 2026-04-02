# frontend/src/hooks/useNtpSync.js

## File Overview

**File path:** `frontend/src/hooks/useNtpSync.js`

Custom React hook that performs a simplified NTP-style clock synchronisation between the client and the server. It sends 5 NTP_PING socket events in rapid succession (200 ms apart) and, on receiving the corresponding NTP_PONG responses, computes the round-trip time and clock offset for each sample. The sample with the median RTT is used to set `ntpOffset` in `useTimerStore`. The sync is repeated every 60 seconds to account for clock drift. This ensures the elapsed timer displayed on the client accurately reflects server-side elapsed time across devices.

**Dependencies (internal):**
- `../stores/useSocketStore`
- `../stores/useTimerStore`

**Dependencies (external):**
- `react` (`useEffect`, `useRef`)

**Side effects when mounted:** Emits NTP_PING socket events; sets `ntpOffset` in `useTimerStore`.

---

## Variables & Constants

| Constant | Type | Value | Description |
|---|---|---|---|
| `NTP_ROUNDS` | `number` | `5` | Number of ping-pong rounds per sync cycle. |
| `NTP_INTERVAL` | `number` | `60_000` | Re-sync interval in milliseconds (60 seconds). |

---

## Functions & Methods

### `useNtpSync()` (default export)

**Signature:** `export default function useNtpSync(): void`

**Description:** Hooks into the socket store and timer store. When a `socket` instance becomes available:
1. Defines `runSync()` which emits `NTP_PING` with `{ t0: Date.now() }` five times, 200 ms apart.
2. Defines `handlePong(data)` which receives `{ t0, t1, t2 }` from the server, computes RTT (`(t3 - t0) - (t2 - t1)`) and offset (`((t1 - t0) + (t2 - t3)) / 2`), and pushes the sample to `samplesRef`.
3. After `NTP_ROUNDS` samples are collected, sorts them by RTT, takes the median sample's offset, and calls `setNtpOffset(Math.round(median.offset))`.
4. Registers the `NTP_PONG` event listener, runs the initial sync, and sets a `setInterval` for re-syncing.
5. Cleans up the event listener and interval on unmount or socket change.

**Side effects:** Sets `ntpOffset` in `useTimerStore` on each completed sync cycle.

**Callers:** `App.jsx` (`AppShell` component, mounted globally).

---

## Exports

| Export | Description |
|---|---|
| `default useNtpSync` | Mounted once in `AppShell`. |

---

## Known Issues & Technical Debt

- The offset calculation assumes roughly symmetric network latency. In asymmetric network conditions (e.g. fast download, slow upload) the computed offset will be biased.
- If the socket disconnects mid-sync, some NTP_PONG events will never arrive and the `samplesRef` array will never reach `NTP_ROUNDS`, meaning no offset update occurs for that cycle. The next 60-second interval will retry.
- The median is found by sorting all samples and taking the middle index; with 5 samples and 0-indexed this is index 2, which is correct.
