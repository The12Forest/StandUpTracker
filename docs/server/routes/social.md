# server/routes/social.js

## File Overview

**File path:** `server/routes/social.js`

Implements all friendship and social features: listing friends with online status, sending/accepting/rejecting/cancelling friend requests, unfriending, blocking, fetching shared friend streaks, and fetching a friend's activity heatmap. All routes require authentication.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`, `requireVerified`)
- `../middleware/guards` (`softBanCheck`, `lastActiveTouch`)
- `../models/Friendship`, `../models/FriendStreak`, `../models/TrackingData`, `../models/User`, `../models/Settings`, `../models/Notification`, `../models/OffDay`
- `../utils/settings` (`getEffectiveGoalMinutes`)
- `../utils/pushSender` (`sendPushNotification`)

**Dependencies (external):**
- `express`

---

## Functions & Methods

### `streakPair(a, b)`

**Signature:** `function streakPair(a: string, b: string): { userA: string, userB: string }`

**Description:** Returns the canonical alphabetical ordering of two userIds for FriendStreak lookups. Ensures `userA < userB` so the same pair always maps to the same document regardless of who initiates the lookup.

**Called by:** All routes that read or write FriendStreak documents.

### `unfriendHandler(req, res)`

**Signature:** `async function unfriendHandler(req, res): void`

**Description:** Shared handler for both `DELETE /friend/:userId` and `DELETE /unfriend/:userId`. Deletes the accepted Friendship record and the associated FriendStreak.

**Called by:** Registered as handler for two route paths.

---

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/friends` | auth | List accepted friends with online status and shared streak |
| `POST` | `/request` | auth, verified | Send a friend request by username |
| `GET` | `/requests` | auth | List pending incoming friend requests |
| `GET` | `/requests/outgoing` | auth | List pending outgoing friend requests |
| `POST` | `/accept/:requestId` | auth | Accept a pending incoming request |
| `POST` | `/reject/:requestId` | auth | Reject a pending incoming request (deletes it) |
| `DELETE` | `/request/:requestId` | auth | Cancel an outgoing pending request |
| `POST` | `/block/:userId` | auth | Block a user (removes friendship + streak) |
| `DELETE` | `/friend/:userId` | auth | Unfriend a user |
| `DELETE` | `/unfriend/:userId` | auth | Unfriend a user (alias) |
| `GET` | `/streak/:friendUserId` | auth | Get shared FriendStreak document for a pair |
| `GET` | `/friend/:userId/heatmap` | auth | Get a friend's last-365-days heatmap (requires accepted friendship) |
| `GET` | `/streaks` | auth | Get all friend streaks with today's progress for both parties |

---

## Route Details

### `GET /friends`

Fetches all accepted Friendship records, loads User docs for friend IDs, loads FriendStreak records, and scans connected Socket.io sockets (`io.fetchSockets()`) to determine online status. Returns each friend with `online`, `timerRunning`, `timerStartedAt`, and `sharedStreak`.

### `POST /request`

Checks `friendRequestsEnabled` setting. Looks up target by username. Performs a bidirectional Friendship check — if any record (pending, accepted, or blocked) exists in either direction, returns an appropriate error. On success, emits `FRIEND_REQUEST` to the target's socket room and creates a persisted `friend_request` Notification.

### `POST /accept/:requestId`

Finds the Friendship by `_id`, verifies the current user is the recipient and status is `pending`. Sets status to `accepted`, upserts an initial FriendStreak record (using `$setOnInsert` to avoid overwriting existing), and uses `io.in(...).socketsJoin(...)` to mutually add each party to the other's `friends:${userId}` room. Emits `FRIEND_ONLINE`, `NOTIFICATION`, and `FRIEND_ACCEPTED` events.

### `POST /block/:userId`

Deletes all Friendship records in either direction between the two users, deletes the FriendStreak, then creates a new Friendship with `status: 'blocked'` (requester = blocker, recipient = blocked).

### `GET /friend/:userId/heatmap`

Verifies an accepted Friendship exists in either direction. Returns daily seconds for the last 365 days plus the friend's off-day set for that period.

### `GET /streaks`

Loads all accepted friendships, fetches today's tracking for all friend IDs plus the current user, resolves each friend's effective goal via `getEffectiveGoalMinutes`, and returns per-friend streak data with today's goal-met status for both parties.

---

## Known Issues & Technical Debt

- `GET /friends` calls `io.fetchSockets()` which scans all connected sockets on every request. On large deployments with many concurrent users this can be expensive.
- The `Settings` model is imported but only accessed via `Settings.get()` (not the `getSetting` utility), which bypasses the 15-second in-memory cache. CANDIDATE FOR MERGE with `getSetting`.
- `GET /streaks` calls `getEffectiveGoalMinutes` in a sequential loop per friend. On a user with many friends this creates N serial async calls. Should be parallelized with `Promise.all`.
- No push notification is sent when a friend request is rejected or cancelled.
- The `unfriendHandler` function is declared after it is assigned as a route handler. This works due to function hoisting but is a readability concern.
