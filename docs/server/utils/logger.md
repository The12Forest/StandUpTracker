# server/utils/logger.js

## File Overview

**File path:** `server/utils/logger.js`

Provides a structured logging utility that writes to both the console and the `Log` MongoDB collection. Respects the `debugMode` and `logLevel` settings. Exports convenience methods `debug`, `info`, `warn`, `error`, and `isDebugMode`.

**Dependencies (internal):**
- `../models/Log`
- `../models/Settings`

**Dependencies (external):** None

---

## Variables & Constants

| Variable | Type | Description |
|---|---|---|
| `LEVELS` | `Object` | Maps level name to numeric priority: `{ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }`. Used for `>=` comparison against the configured minimum log level. |

---

## Functions & Methods

### `isDebugMode()`

**Signature:** `async function isDebugMode(): Promise<boolean>`

**Description:** Reads the `debugMode` setting from the Settings collection. Returns `false` on error. Exported so callers can conditionally compute expensive debug information.

**Called by:** `shouldLog`, `log`, and exported for use by other modules.

### `shouldLog(level)`

**Signature:** `async function shouldLog(level: string): Promise<boolean>`

**Description:** Returns `true` if `debugMode` is on (logs everything) or if the given level's numeric priority is >= the configured `logLevel`. Default `logLevel` is `'INFO'`.

**Called by:** `log`.

### `log(level, message, meta)`

**Signature:** `async function log(level: string, message: string, meta?: object): Promise<void>`

**Description:** The core logging function. Calls `shouldLog` — if false, returns immediately. Writes to the appropriate console method (`console.error`, `console.warn`, `console.debug`, or `console.log`). Appends `JSON.stringify(meta.meta)` to console output only in debug mode. Persists a `Log` document using all fields from `meta` except `level` and `message` (which are destructured out to avoid accidental overwrites). On DB persist failure, logs the error to `console.error`.

**Side effects:** Writes to MongoDB `Log` collection.

**Called by:** All exported convenience methods.

---

## Exports

```js
module.exports = {
  debug: (msg, meta) => log('DEBUG', msg, meta),
  info:  (msg, meta) => log('INFO',  msg, meta),
  warn:  (msg, meta) => log('WARN',  msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
  isDebugMode,
};
```

Used pervasively throughout the server codebase.

---

## Known Issues & Technical Debt

- Every log call makes at least two async DB reads (`isDebugMode` → `Settings.get('debugMode')` and `Settings.get('logLevel')`). These reads bypass the 15-second settings cache (`getSetting` from `settings.js` is not used). On high-traffic servers generating many log entries this creates unnecessary DB load. CANDIDATE FOR MERGE with `getSetting`.
- `shouldLog` calls `isDebugMode()` and then optionally `Settings.get('logLevel')` — both bypass the cache. `isDebugMode` is also called a second time inside `log()` for the console output formatting, resulting in three Settings reads per log entry at DEBUG level.
- Log entries are fire-and-forget from the caller's perspective (the returned Promise is not awaited by most callers). If the DB is slow, log calls silently succeed but the DB write may be delayed.
