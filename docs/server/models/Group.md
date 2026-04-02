# server/models/Group.js

## File Overview

**File path:** `server/models/Group.js`

Defines the Mongoose model for groups — collections of users who can view each other's schedules, compete on a shared leaderboard, and maintain a group streak. Groups have a UUID `groupId`, a name, an embedded members array, an embedded invites array, leaderboard configuration, and streak tracking fields.

**Dependencies (external):**
- `mongoose`
- `uuid` (`v4`)

**Side effects when loaded:** Registers the `Group` model and its indexes.

---

## Classes & Models

### Embedded `memberSchema`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userId` | `String` | Yes | — | UUID of the member user |
| `role` | `String` (enum) | No | `'member'` | Either `'owner'` or `'member'` |
| `joinedAt` | `Date` | No | `Date.now` | When the user joined the group |

### Embedded `inviteSchema`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userId` | `String` | Yes | — | UUID of the invited user |
| `invitedBy` | `String` | Yes | — | UUID of the member who sent the invite |
| `createdAt` | `Date` | No | `Date.now` | When the invite was created |

### `Group`

**Collection name:** `groups`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `groupId` | `String` | No | `uuidv4()` | Unique identifier for the group |
| `name` | `String` | Yes | — | Display name (max 50 characters) |
| `members` | `[memberSchema]` | No | — | Embedded array of current members |
| `invites` | `[inviteSchema]` | No | — | Embedded array of pending invitations |
| `leaderboardCriterion` | `String` (enum) | No | `'weeklyTime'` | Ranking metric: `weeklyTime`, `totalTime`, `level`, `streak` |
| `currentStreak` | `Number` | No | `0` | Current consecutive days all members met their goal |
| `bestStreak` | `Number` | No | `0` | All-time best group streak |
| `lastSyncDate` | `String` | No | — | YYYY-MM-DD last processed by midnight rollover |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Unique | `groupId` | unique | Primary identifier lookup |
| Single | `members.userId` | — | Find all groups a user belongs to |
| Single | `invites.userId` | — | Find all pending invitations for a user |

---

## Exports

```js
module.exports = mongoose.model('Group', groupSchema);
```

Used by `server/routes/groups.js`, `server/routes/scheduler.js`, and `server/utils/streaks.js`.

---

## Known Issues & Technical Debt

- Embedding members and invites inside the group document works well for groups up to `maxGroupSize` (default 20), but could cause document growth issues if limits are raised significantly.
- No `deletedAt` soft-delete field — groups are hard-deleted when dissolved.
