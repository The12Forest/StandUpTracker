# server/models/FriendStreak.js

## File Overview

**File path:** `server/models/FriendStreak.js`

Defines the Mongoose model for tracking shared streak records between two friends. A FriendStreak document is created when a friendship is accepted and tracks how many consecutive days both users have met their daily goal simultaneously. `userA` and `userB` are stored in canonical alphabetical order (enforced by `streakPair()` in `server/utils/streaks.js`) to ensure there is only one document per friend pair.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `FriendStreak` model and its unique compound index.

---

## Classes & Models

### `FriendStreak`

**Collection name:** `friendstreaks`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userA` | `String` | Yes | — | The lexicographically smaller userId of the pair |
| `userB` | `String` | Yes | — | The lexicographically larger userId of the pair |
| `currentStreak` | `Number` | No | `0` | Consecutive days both users have met their goal |
| `bestStreak` | `Number` | No | `0` | All-time best consecutive days for this pair |
| `lastSyncDate` | `String` | No | — | YYYY-MM-DD of the last date processed by the midnight rollover (idempotency key) |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Compound | `(userA, userB)` | unique | One document per ordered pair of friends |

---

## Exports

```js
module.exports = mongoose.model('FriendStreak', friendStreakSchema);
```

Used by `server/utils/streaks.js` and `server/routes/social.js`.

---

## Known Issues & Technical Debt

- No cascade deletion. When a friendship is dissolved or a user is deleted, the corresponding `FriendStreak` document is not removed, leaving orphaned records.
