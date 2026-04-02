# server/routes/scheduler.js

## File Overview

**File path:** `server/routes/scheduler.js`

Implements the weekly schedule view endpoints. Provides personal session data for a given week (with off-day markers), user self-service off-day management (current/future only), and a shared group schedule view for all group members. All routes require authentication.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`, `requireVerified`)
- `../middleware/guards` (`softBanCheck`, `lastActiveTouch`)
- `../models/TrackingData`, `../models/OffDay`, `../models/Group`, `../models/User`, `../models/Settings`

**Dependencies (external):**
- `express`

---

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sessions` | auth, verified | Fetch personal sessions and off days for a given week |
| `POST` | `/off-days` | auth, verified | Mark a current or future date as an off day |
| `DELETE` | `/off-days/:date` | auth, verified | Remove an off day |
| `GET` | `/group/:groupId` | auth, verified | Fetch all group members' sessions and off days for a week |

---

## Route Details

### `GET /sessions`

**Query params:** `weekStart` (YYYY-MM-DD, required)

Computes `weekEnd` as `weekStart + 6 days`. Returns TrackingData (seconds + sessions array with `forgottenCheckout` flag) and OffDay records for the user within that range.

**Returns:** `{ days: { [date]: { seconds, sessions[] } }, offDays: { [date]: true } }`

### `POST /off-days`

**Body:** `{ date }` (YYYY-MM-DD)

Rejects past dates. Uses upsert (`findOneAndUpdate`) to avoid duplicates. Emits `OFFDAY_UPDATE` via Socket.io to both the user's own room (`user:${userId}`) and their friends' room (`friends:${userId}`).

**Returns:** `{ message: 'Off day marked' }`

### `DELETE /off-days/:date`

**Params:** `date` (YYYY-MM-DD)

Deletes the OffDay record. Emits `OFFDAY_UPDATE` with `action: 'remove'` to user and friends rooms.

**Returns:** `{ message: 'Off day removed' }`

### `GET /group/:groupId`

**Query params:** `weekStart` (YYYY-MM-DD, required)

Verifies membership in the group. Fetches TrackingData and OffDay records for all members for the week. Builds a per-member map with username, per-day session data, and per-day off-day flags.

**Returns:** `{ groupName, members: { [userId]: { username, days: { [date]: { seconds, sessions[] } }, offDays: { [date]: true } } } }`

---

## Known Issues & Technical Debt

- The `Settings` model is imported but never used in this file. CANDIDATE FOR REMOVAL.
- Off-day creation allows any current or future date without a practical upper bound, so users could mark dates years in the future.
- The group schedule endpoint exposes each member's full session times (start, end, duration) to all group members, with no per-user privacy option.
- There is no pagination on the group schedule endpoint; all members' data for the full week is fetched in one query.
