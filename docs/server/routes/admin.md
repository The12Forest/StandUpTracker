# server/routes/admin.js

## File Overview

**File path:** `server/routes/admin.js`

This is the largest route file in the project. It implements the full Admin Console backend: system stats, user management (CRUD, bulk operations, role changes, impersonation), tracking data editing, settings management, log viewing, audit log, SMTP testing, and VAPID key generation. All routes require at minimum `authenticate`, `softBanCheck`, and `lastActiveTouch`; most require `requireRole('admin', 'super_admin')` or `requireRole('super_admin')`.

**Dependencies (internal):**
- All major models: `User`, `Session`, `Log`, `Settings`, `TrackingData`, `AuditLog`, `Friendship`, `Group`, `DailyGoalOverride`, `OffDay`, `FriendStreak`, `AiAdviceCache`
- `../utils/recalcStats`
- `../utils/streaks` (`checkAndSetGoalMet`)
- `../utils/logger`
- `../utils/email` (`sendVerificationEmail`, `resetTransporter`, `testSmtpConnection`)
- `../utils/settings` (`getAppConfig`, `invalidateCache`, `getEffectiveGoalMinutes`)
- `./auth` (`createSession`) — for impersonation session creation

**Dependencies (external):**
- `express`, `os`, `argon2`, `crypto`

**Side effects when loaded:**
- Starts a `setInterval` (every 10 seconds) that samples CPU usage and maintains a rolling 5-minute average in `cpuUsageCache`.

---

## Variables & Constants

| Name | Type | Description |
|---|---|---|
| `adminRoles` | `string[]` | `['admin', 'super_admin']` — used in `requireRole()` calls |
| `cpuUsageCache` | `object` | `{ current, samples[], lastMeasured }` — rolling CPU usage state |
| `prevCpu` | `object` | CPU usage snapshot from the previous 10-second interval |

---

## Route Summary

| Method | Path | Role Required | Description |
|---|---|---|---|
| `GET` | `/stats` | admin+ | System health, user metrics, tracking stats, streak stats |
| `GET` | `/users` | admin+ | Paginated user list with search and deleted filter |
| `PUT` | `/users/:userId` | super_admin | Update user role, active status, or blockedUntil |
| `POST` | `/users/bulk` | super_admin | Bulk deactivate, activate, setRole, or soft-delete users |
| `GET` | `/users/:userId` | admin+ | Get full user profile |
| `DELETE` | `/users/:userId` | super_admin | Soft-delete a user (rename, deactivate, set deletedAt) |
| `PUT` | `/users/:userId/password` | super_admin | Admin-set a user's password |
| `POST` | `/users/:userId/verify-email` | admin+ | Admin-verify a user's email |
| `POST` | `/users/:userId/force-reverify` | admin+ | Force user to re-verify email |
| `GET` | `/users/:userId/sessions` | admin+ | List all active sessions for a user |
| `DELETE` | `/users/:userId/sessions/:sessionId` | super_admin | Revoke a specific session |
| `DELETE` | `/users/:userId/sessions` | super_admin | Revoke all sessions for a user |
| `GET` | `/tracking/:userId` | admin+ | Get all tracking data for a user |
| `PUT` | `/tracking/:userId/:date` | admin+ | Edit a user's daily total (manual override) |
| `DELETE` | `/tracking/:userId/:date/override` | admin+ | Reset to original timer value |
| `DELETE` | `/tracking/:userId/:date` | super_admin | Delete a specific day's tracking record |
| `GET` | `/daily-goal-overrides/:userId` | admin+ | List all goal overrides for a user |
| `PUT` | `/daily-goal-overrides/:userId/:date` | admin+ | Set a daily goal override |
| `DELETE` | `/daily-goal-overrides/:userId/:date` | admin+ | Clear a daily goal override |
| `GET` | `/off-days/:userId` | admin+ | List off days for a user |
| `PUT` | `/off-days/:userId/:date` | admin+ | Mark an off day for a user |
| `DELETE` | `/off-days/:userId/:date` | admin+ | Remove an off day for a user |
| `GET` | `/reports` | admin+ | List all pending/confirmed reports |
| `PUT` | `/reports/:reportId` | admin+ | Confirm or dismiss a report |
| `POST` | `/reports/:targetUserId/restore` | admin+ | Restore cleared tracking data |
| `GET` | `/settings` | admin+ | Get all settings |
| `PUT` | `/settings` | super_admin | Bulk update settings |
| `POST` | `/settings/test-smtp` | super_admin | Test the SMTP connection |
| `POST` | `/settings/generate-vapid` | super_admin | Generate new VAPID key pair |
| `POST` | `/impersonate/:userId` | super_admin | Start impersonating a user |
| `POST` | `/impersonate/end` | (any auth) | End impersonation and restore original session |
| `GET` | `/logs` | admin+ | Paginated log viewer with level/search filters |
| `GET` | `/audit` | admin+ | Paginated audit log viewer |
| `GET` | `/health` | admin+ | System health summary |
| `POST` | `/recalc-stats` | super_admin | Trigger stats recalculation for all users |

---

## Functions & Methods

### `measureCpuUsage()`

**Signature:** `function measureCpuUsage(): { idle: number, total: number }`

**Description:** Reads CPU times from `os.cpus()` and returns averaged idle and total tick counts across all CPU cores.

**Called by:** Module-level `setInterval` and initial `prevCpu` assignment.

---

## Known Issues & Technical Debt

- **No test coverage.** All admin operations are high-risk; errors in bulk operations can affect many users.
- The CPU measurement `setInterval` runs in the background indefinitely, even if the admin stats endpoint is never called.
- Some routes use `requireRole('admin', 'super_admin')` while others use only `requireRole('super_admin')`. The inconsistency is intentional but could benefit from explicit documentation inline.
- The disk usage detection uses `execSync` with platform-specific commands (`wmic` on Windows, `df` on Linux). This is fragile and will fail in restricted container environments.
- The `TABS` label `'Audit Log'` is assigned to the tab with `id: 'config'`, which is a naming mismatch carried from an older design.
