# server/routes/reports.js

## File Overview

**File path:** `server/routes/reports.js`

Implements the peer-reporting system. Users can report an active timer session they suspect is fraudulent. When reports for a session reach the configured threshold, all reports are confirmed, the target's daily tracking is zeroed, stats are recalculated, and notifications are sent to both the target user and all admins.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`)
- `../middleware/guards` (`softBanCheck`, `lastActiveTouch`)
- `../models/User`, `../models/Report`, `../models/TrackingData`, `../models/Notification`, `../models/AuditLog`
- `../utils/settings` (`getSetting`)
- `../utils/recalcStats` (`recalcUserStats`)
- `../utils/streaks` (`checkAndSetGoalMet`)
- `../utils/pushSender` (`sendPushNotification`)
- `../utils/logger`

**Dependencies (external):**
- `express`

---

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | auth | Submit a report against a user's active timer session |
| `GET` | `/check/:targetUserId` | auth | Check if the current user has already reported the target's current session |

---

## Route Details

### `POST /`

**Body:** `{ targetUserId, reason? }`

**Flow:**
1. Reads `allowSelfReport` setting; rejects self-reports if false.
2. Verifies the target exists, is active, and has `timerRunning: true`. Returns `400` if no active session.
3. Derives `sessionId` from `target.timerStartedAt.toISOString()`.
4. Checks reporter cooldown via `reportCooldownMinutes` setting (default 60). Returns `429` with wait time if within cooldown.
5. Checks for duplicate report from same reporter on same session. Returns `409` if duplicate.
6. Creates the Report document.
7. Counts total confirmed + pending reports for this `(targetUserId, sessionId)`.
8. Emits a `report_warning` in-app notification with report count and threshold to the target via Socket.io and push.
9. If `sessionReportCount >= threshold`:
   - Updates all reports for this session to `status: 'confirmed'`.
   - Sets `preReportSeconds`, zeros `seconds`, clears `sessions`, sets `clearedByReports: true`.
   - Calls `recalcUserStats` and `checkAndSetGoalMet`.
   - Emits `STATS_UPDATE` socket event to target with zeroed stats.
   - Sends `report_cleared` notification to target.
   - Sends `admin_report_alert` notification to all admins.

**Returns:** `{ message, reportCount, threshold }`

**Error codes:**
- `400` — self-report, no active session, missing target
- `404` — user not found
- `409` — duplicate report or `11000` unique constraint
- `429` — reporter cooldown active
- `500` — unexpected error

### `GET /check/:targetUserId`

**Params:** `targetUserId`

**Flow:** Looks up the target's current session. Checks if the current user has an existing Report document for that session.

**Returns:** `{ reported: boolean, timerActive: boolean, sessionId? }`

---

## Known Issues & Technical Debt

- The report threshold check uses `>=` which means the threshold action fires on every report from the threshold onward, not just exactly at the threshold. Multiple reports beyond the threshold re-trigger the threshold logic (though the `clearedByReports` guard prevents double-clearing of tracking data).
- `AuditLog` is imported but never used in this file. This is dead code.
- Error handlers for most routes silently swallow error details (bare `catch` block with no `err` parameter on the check route).
- No mechanism exists to prevent a burst of simultaneous reports from multiple users all arriving just under the threshold simultaneously — the cooldown only limits each individual reporter.
