# server/models/OffDay.js

## File Overview

**File path:** `server/models/OffDay.js`

Defines the Mongoose model for marking a specific date as an "off day" for a user. Off days are excluded from streak calculations (the streak pauses rather than breaks) and from reminder notifications. Users can self-service mark current and future dates; admins can mark any date.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `OffDay` model and its unique compound index.

---

## Classes & Models

### `OffDay`

**Collection name:** `offdays`

| Property | Type | Required | Description |
|---|---|---|---|
| `userId` | `String` | Yes | UUID of the user this off day belongs to |
| `date` | `String` | Yes | YYYY-MM-DD string of the off day |
| `createdAt` | `Date` | Auto | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Single | `userId` | — | Fetch all off days for a user |
| Compound | `(userId, date)` | unique | Enforce one record per user per day |

---

## Exports

```js
module.exports = mongoose.model('OffDay', offDaySchema);
```

Used by `server/routes/scheduler.js`, `server/routes/admin.js`, `server/utils/settings.js` (`isOffDay`), `server/utils/streaks.js`, and `server/utils/recalcStats.js`.

---

## Known Issues & Technical Debt

- No TTL index. Off days for the distant past accumulate indefinitely. A cleanup of records older than 2 years could be considered.
