# server/routes/ai.js

## File Overview

**File path:** `server/routes/ai.js`

Implements two endpoints for the AI advice feature. The `GET` endpoint serves advice from the database cache without triggering generation. The `POST` endpoint generates fresh advice by calling the Ollama API and caches the result. Access is gated by `aiGateCheck` (Ollama enabled + user opted in) and an in-memory per-user rate limiter (max 10 requests/hour). An admin-only `GET /models` endpoint lists available Ollama models.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`, `requireVerified`, `requireRole`)
- `../middleware/guards` (`aiGateCheck`, `softBanCheck`)
- `../models/TrackingData`
- `../models/AiAdviceCache`
- `../models/Settings`
- `../utils/settings` (`getEffectiveGoalMinutes`, `getSetting`)
- `../utils/logger`

**Dependencies (external):**
- `express`
- `fetch` (Node 18+ built-in)

**Side effects when loaded:** Creates the module-level `aiRateMap` Map.

---

## Variables & Constants

| Name | Type | Description |
|---|---|---|
| `aiRateMap` | `Map<string, number[]>` | In-memory per-user request timestamps for the hourly rate limiter |

---

## Functions & Methods

### `aiRateLimit(req, res, next)` (middleware)

**Signature:** `function aiRateLimit(req, res, next)`

**Description:** Allows at most 10 POST requests per user per rolling hour. Timestamps are stored in `aiRateMap` in memory and purged as they age out. Returns `429` when the limit is exceeded.

---

## Route Handlers

### `GET /models` — List Ollama models

**Auth:** `authenticate`, `softBanCheck`, `requireRole('admin', 'super_admin')`

**Description:** Fetches the list of available models from the Ollama `/api/tags` endpoint. Applies a 10-second abort timeout. Returns `{ models: [{ name, size, modifiedAt }] }`.

---

### `GET /advice` — Get cached advice

**Auth:** `authenticate`, `softBanCheck`, `requireVerified`, `aiGateCheck`

**Query params:** `context` (default: `'dashboard'`)

**Description:** Looks up the `AiAdviceCache` for a valid (non-expired) entry for the user. If found, returns the cached advice along with `generatedAt` and `nextRefreshAt`. If no valid cache exists, returns `{ advice: null, cached: false }`. Does not generate new advice.

---

### `POST /advice` — Generate or refresh advice

**Auth:** `authenticate`, `softBanCheck`, `requireVerified`, `aiGateCheck`, `aiRateLimit`

**Body:** `{ context?: string, forceRefresh?: boolean }`

**Description:** Full advice generation flow:
1. Checks cooldown against the last generated entry. Returns `429` with `retryAfterSeconds` and cached advice if still cooling down.
2. If `forceRefresh` is false and cache is still fresh (within `aiAdviceCacheDurationMinutes`), returns cached advice.
3. Queries last 30 days of tracking data and builds a stats summary.
4. Loads admin system prompt and max tokens settings.
5. Posts to Ollama `/api/generate` with a 60-second abort timeout.
6. Upserts the result in `AiAdviceCache`.
7. Returns the advice text, `generatedAt`, `cached: false`, and `nextRefreshAt`.

---

## Known Issues & Technical Debt

- `aiRateMap` is in-process memory. It is not shared across multiple Node processes and is cleared on server restart, resetting rate limits.
- The `forceRefresh` body parameter is accepted but the cooldown check always runs first regardless of `forceRefresh`, making it impossible to force a refresh before the cooldown expires. This is intentional but not clearly documented.
- The system prompt and user prompt are inline strings in the route handler. Moving them to a constants file would improve maintainability.
