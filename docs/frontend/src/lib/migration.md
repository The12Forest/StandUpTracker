# frontend/src/lib/migration.js

## File Overview

**File path:** `frontend/src/lib/migration.js`

One-time migration utility that scavenges tracking data from the legacy vanilla-JS version of StandUpTracker stored in `localStorage` and cookies. When a new user registers, `RegisterPage` calls `scavengeLegacyData()` and, if legacy data is found, includes it in the registration API request so the server can import historical tracking records. After successful registration, `clearLegacyData()` removes the known legacy keys.

The module is careful never to touch the active session keys used by the React SPA (`sut_token`, `sut_user`, `sut_originalToken`, `sut_isImpersonating`).

**Dependencies (internal):** None.

**Dependencies (external):** `localStorage`, `document.cookie` (browser built-ins).

**Side effects when loaded:** None.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `LEGACY_KEYS` | `string[]` | Array of known legacy `localStorage` key names: `'sut_tracking'`, `'standuptracker_features'`, `'standupData'`, `'timerData'`. |

---

## Functions & Methods

### `scavengeLegacyData()`

**Signature:** `export function scavengeLegacyData(): object | null`

**Returns:** An object containing all found legacy data keyed by their storage key names, or `null` if nothing was found.

**Description:** Three-phase scan:
1. **Known keys:** Iterates `LEGACY_KEYS`, attempts `JSON.parse` for each found value, falls back to raw string on parse failure.
2. **Pattern scan:** Iterates all `localStorage` keys and picks up any key matching `/standup|tracker|sut_/i` that is not already collected and is not in the active session key set (`sut_token`, `sut_user`, `sut_originalToken`, `sut_isImpersonating`).
3. **Cookie scan:** Parses `document.cookie` for keys matching `/standup|tracker|sut/i`, collects them under `result._cookies`.

Returns `null` if no data was found in any phase.

**Callers:** `RegisterPage.jsx` — called once on registration form submit.

---

### `clearLegacyData()`

**Signature:** `export function clearLegacyData(): void`

**Description:** Removes all keys listed in `LEGACY_KEYS` from `localStorage`. Does not remove cookie values or pattern-matched keys found by the scan.

**Callers:** `[CANDIDATE FOR REMOVAL — no callers found in current codebase]`. The function is exported but `RegisterPage` does not call it after registration; the legacy keys are never explicitly cleaned up.

---

## Exports

```js
export { scavengeLegacyData, clearLegacyData };
```

---

## Known Issues & Technical Debt

- `clearLegacyData()` is defined but never called anywhere in the current codebase. `[CANDIDATE FOR REMOVAL — no callers found]`
- The cookie scan collects values but the server-side handler for `legacyData._cookies` is unknown; if the server does not process cookie data, it is collected and sent but silently ignored.
- This module will become dead code once all users have migrated from the legacy SPA. There is no mechanism to detect when migration is complete and disable this scan.
