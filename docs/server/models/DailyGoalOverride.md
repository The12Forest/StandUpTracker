# server/models/DailyGoalOverride.js

## File Overview

**File path:** `server/models/DailyGoalOverride.js`

Defines the Mongoose model for per-user, per-day goal overrides. When an admin sets a daily goal override for a specific user on a specific date, that value takes highest priority in the `getEffectiveGoalMinutes` resolution chain, above the master enforcement goal and the user's own preference.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `DailyGoalOverride` model and its unique compound index.

---

## Classes & Models

### `DailyGoalOverride`

**Collection name:** `dailygoaloverrides`

| Property | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `userId` | `String` | Yes | — | UUID of the user this override applies to |
| `date` | `String` | Yes | YYYY-MM-DD format | The specific date the override is active for |
| `goalMinutes` | `Number` | Yes | min: 1, max: 1440 | The overridden goal in minutes for that day |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Compound | `(userId, date)` | unique | Enforces one override per user per day |

---

## Exports

```js
module.exports = mongoose.model('DailyGoalOverride', dailyGoalOverrideSchema);
```

Used by `server/utils/settings.js` (`getEffectiveGoalMinutes`) and `server/utils/recalcStats.js`.

---

## Known Issues & Technical Debt

- No TTL index. Old override records for past dates accumulate indefinitely. Periodic cleanup of overrides older than a year would reduce collection growth.
