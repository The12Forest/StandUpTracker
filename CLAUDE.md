# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend
npm install                          # Install backend deps
npm start                            # Production (port 3000)
npm run dev                          # Dev with nodemon
node --check server/routes/foo.js    # Syntax-check a server file after editing

# Frontend
cd frontend && npm install           # Install frontend deps
cd frontend && npm run dev           # Vite dev server (port 5173, proxies /api to backend)
cd frontend && npm run build         # Production build (validates everything)
cd frontend && npm run lint          # ESLint

# Docker
docker compose up -d                 # App + MongoDB 7 on port 3000
```

**No test framework is configured.** Use `node --check` for backend and `npm run build` + `npm run lint` for frontend validation.

## Architecture

**Standing desk tracker** with timer, streaks, social features, groups, leaderboard, AI advisor, and admin console.

### Backend (Express + MongoDB + Socket.io)

Entry point: `server/index.js` — sets up Express, Socket.io, route mounting, SPA fallback, and hourly streak cleanup.

**Middleware chain** (order matters):
- `authenticate` — JWT from Bearer token or `sut_session` HttpOnly cookie → loads full User doc into `req.user`
- `requireVerified` — blocks unverified email users
- `softBanCheck` — blocks suspended users (`blockedUntil > now`)
- `lastActiveTouch` — updates `user.lastActiveAt` (debounced 5min)
- `currentDayGuard` — non-admins can only modify today's tracking data
- `impersonationGuard` — prevents certain actions during admin impersonation
- `maintenanceGate` — 503 for non-super_admins during maintenance

Standard route-level pattern:
```js
router.use(authenticate, softBanCheck, lastActiveTouch);
router.post('/thing', requireVerified, currentDayGuard, async (req, res) => { ... });
```

**Routes:** auth, api (timer + tracking + user self-service time editing), admin, social, groups, leaderboard, notifications, onboarding, ai

**Models:** User (UUID userId, Argon2 passwords, role enum, stats, timer state, 2FA), TrackingData (userId+date unique, seconds, sessions array, manualOverride flag, originalSeconds), DailyGoalOverride (per-user per-day goal overrides, 1-1440 min), Settings (key-value, DB-backed config), Group, Friendship, FriendStreak, AuditLog (365d TTL), Notification, Log, AiAdviceCache (per-user cached AI advice with TTL auto-cleanup)

**DB-backed settings** (`server/utils/settings.js`): Nearly all configuration (JWT secret, SMTP, feature flags, limits, AI config) lives in the Settings collection with a 15-second in-memory cache. Access via `getSetting(key)` / `getEffectiveGoalMinutes(user)`. The JWT secret is auto-generated on first launch if blank.

### Stats Recalculation (`server/utils/recalcStats.js`)

`recalcUserStats(userId)` is the single source of truth for computing user stats. It loads all TrackingData, respects per-day DailyGoalOverride entries, and calculates totalSeconds, totalDays, currentStreak, bestStreak, and level. Stats are **always fully recalculated**, never incremented. Call this after any tracking data mutation.

### Manual Override System

TrackingData records track whether they've been manually edited (`manualOverride: true`) and preserve the original timer value (`originalSeconds`). Both admin and user self-service time editing endpoints set these fields on first edit and support resetting to original via `DELETE .../override` endpoints.

### AI Advice System

- `GET /api/ai/advice` — serves cached advice from AiAdviceCache (no generation)
- `POST /api/ai/advice` — generates fresh advice via Ollama, subject to server-side cooldown (`aiAdviceCooldownMinutes`) and cache duration (`aiAdviceCacheDurationMinutes`). Returns 429 with `retryAfterSeconds` and `nextRefreshAt` when cooldown active
- Admin configures Ollama endpoint, model, system prompt, max tokens, cooldown, and cache duration via Settings

### Frontend (React 19 + Vite + Zustand + Tailwind CSS 4)

**Zustand stores** drive state:
- `useAuthStore` — user profile, login/logout, impersonation, token management (`sut_token` in localStorage)
- `useSocketStore` — Socket.io connection, listens for TIMER_SYNC / STATS_UPDATE / NOTIFICATION / SETTINGS_CHANGED
- `useTimerStore` — timer state with NTP offset correction (`correctedNow()` for accurate elapsed display)
- `useNotificationStore` / `useToastStore` — notifications and toast messages

**API layer** (`frontend/src/lib/api.js`): fetch wrapper that attaches Bearer token or relies on HttpOnly cookie; auto-clears auth and redirects on 401. Thrown errors include `.status` (HTTP code) and `.data` (parsed response body) for handling specific status codes like 429.

### Socket.io (`server/socket/handler.js`)

**Rooms:** `user:${userId}` (cross-device sync), `friends:${friendId}`, `admins`, `authenticated`

Key flows:
- TIMER_START/STOP → server-authoritative timer with full stats recalc on stop → broadcasts TIMER_SYNC + STATS_UPDATE
- COUNTER_START/STOP → global counter state sync across all devices
- NTP_PING → clock offset calculation for accurate client-side elapsed time
- Friend online/offline presence via room joins

### Streak System (`server/utils/streaks.js`)

- **Personal:** Full recalc from TrackingData on every timer stop — walks backward from today counting consecutive days meeting goal
- **Friend streaks:** Both friends must meet threshold on same calendar day; `syncFriendStreaks()` called after tracking save
- **Group streaks:** ALL members must meet threshold; `syncGroupStreaks()` called after tracking save
- **Hourly cleanup** in `server/index.js` resets streaks for missed days

### Per-Day Goal Overrides

`DailyGoalOverride` allows admins to set a different goal for specific user+date combinations. `getEffectiveGoalMinutes(user, date)` resolves the effective goal: per-day override > enforced master goal > user preference > default. The `recalcUserStats` utility and all streak calculations respect these overrides.

## Working Guidelines

- Keep middleware chains consistent — especially `authenticate`, `requireVerified`, `softBanCheck` ordering.
- Preserve API response shapes (`{ error: "msg" }` for errors, direct objects for success) — frontend depends on them.
- Favor small, focused patches over broad refactors.
- Validate backend edits: `node --check server/routes/changed-file.js`
- Validate frontend edits: `cd frontend && npm run build`
- Date strings use `YYYY-MM-DD` format throughout. UUIDs (v4) for userId and groupId.
- Stats are always fully recalculated from TrackingData via `recalcUserStats()`, never incremented.
- Roles: `user | moderator | admin | super_admin`. First registered user auto-becomes super_admin.
- Only env var needed: `MONGO_URI`. Everything else is configured via Admin Console → Settings collection.
- Admin page uses URL-based tab state (`?tab=users`). Back navigation from sub-pages should preserve the tab (e.g., `/admin?tab=users`).
- New SPA routes must be added to the `spaPages` array in `server/index.js` for the catch-all fallback to work.

## Docker

Multi-stage Dockerfile: stage 1 builds frontend, stage 2 runs Express serving the built SPA + API. `docker-compose.yml` provides app + MongoDB 7 with a `mongo-data` volume. First launch redirects to `/setup` for initial configuration.
