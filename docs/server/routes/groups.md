# server/routes/groups.js

## File Overview

**File path:** `server/routes/groups.js`

Implements group management endpoints: listing a user's groups, getting group details with leaderboard data, creating groups, inviting members, accepting/rejecting invitations, removing members, leaving groups, deleting groups, and updating the leaderboard criterion. All routes require authentication.

**Dependencies (internal):**
- `../middleware/auth` (`authenticate`, `requireVerified`)
- `../middleware/guards` (`softBanCheck`, `lastActiveTouch`)
- `../models/Group`, `../models/User`, `../models/Notification`, `../models/TrackingData`, `../models/Settings`
- `../utils/settings` (`getEffectiveGoalMinutes`)

**Dependencies (external):**
- `express`

---

## Route Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | auth | List all groups the user belongs to |
| `GET` | `/invites/pending` | auth | List pending invitations for current user |
| `GET` | `/:groupId` | auth, member-check | Group detail: members, weekly/today stats, leaderboard |
| `POST` | `/` | auth, verified | Create a new group (subject to `groupsEnabled` and `maxGroupsPerUser`) |
| `POST` | `/:groupId/invite` | auth, member(owner) | Invite a user to the group |
| `POST` | `/:groupId/accept` | auth | Accept a pending group invitation |
| `POST` | `/:groupId/reject` | auth | Reject a pending group invitation |
| `DELETE` | `/:groupId/members/:userId` | auth, owner | Remove a member from the group |
| `POST` | `/:groupId/leave` | auth, member | Leave a group (owner must transfer or disband first) |
| `DELETE` | `/:groupId` | auth, owner | Disband the group |
| `PUT` | `/:groupId/leaderboard-criterion` | auth, owner | Change the leaderboard ranking metric |

---

## Key Route Details

### `GET /:groupId`

Returns full group detail including:
- Member list with `userId`, `username`, `level`, `totalStandingSeconds`, `currentStreak`
- Today's tracking seconds per member
- Weekly tracking seconds per member (respecting `firstDayOfWeek` setting)
- Effective daily goal per member
- Group streak (`currentStreak`, `bestStreak`)

The `leaderboardCriterion` (`weeklyTime`, `totalTime`, `level`, `streak`) is returned but sorting is left to the frontend.

---

## Known Issues & Technical Debt

- The `/invites/pending` route must be declared before `/:groupId` to prevent Express from interpreting `'invites'` as a `groupId` parameter. This ordering dependency is fragile and should be enforced by a comment.
- No notification is sent when a member is forcibly removed from a group by the owner.
- When the last owner leaves or is removed, the group loses its owner without automatic promotion of another member.
