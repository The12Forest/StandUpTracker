# server/models/TrackingData.js

## File Overview

**File path:** `server/models/TrackingData.js`

Defines the Mongoose model for daily tracking records. Each document represents one user's standing time for one calendar day. It stores the total accumulated seconds, an array of individual sessions with start/end timestamps, flags for goal achievement and manual overrides, and a report-clearing subsystem.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `TrackingData` model and its unique compound index.

---

## Classes & Models

### Embedded session sub-document

| Property | Type | Description |
|---|---|---|
| `start` | `Date` | Session start time |
| `end` | `Date` | Session end time |
| `duration` | `Number` | Session duration in seconds |
| `forgottenCheckout` | `Boolean` (default `false`) | True if this session was finalized via the forgotten checkout flow |

### `TrackingData`

**Collection name:** `trackingdatas`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userId` | `String` | Yes | — | UUID of the user |
| `date` | `String` | Yes | — | YYYY-MM-DD date string |
| `seconds` | `Number` | No | `0` | Total accumulated standing seconds for the day |
| `sessions` | `[session]` | No | — | Embedded array of individual timer sessions |
| `goalMet` | `Boolean` | No | `false` | Whether the user met their daily goal on this day (maintained by `streaks.js`) |
| `manualOverride` | `Boolean` | No | `false` | True if an admin has manually edited the time |
| `originalSeconds` | `Number` | No | `null` | Preserved original timer value before first manual edit |
| `clearedByReports` | `Boolean` | No | `false` | True if this day's progress was cleared by the report system |
| `reportClearedAt` | `Date` | No | `null` | When the report clearing occurred |
| `reportCount` | `Number` | No | `0` | Number of reports that triggered the clearing |
| `preReportSeconds` | `Number` | No | `null` | The seconds value before reports cleared it (for admin restore) |
| `reportRestored` | `Boolean` | No | `false` | True if an admin has restored the pre-report seconds |
| `reportRestoredBy` | `String` | No | `null` | userId of the admin who restored |
| `reportRestoredAt` | `Date` | No | `null` | When the restore happened |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**Indexes:**
| Index | Fields | Options | Purpose |
|---|---|---|---|
| Compound | `(userId, date)` | unique | One record per user per day |

---

## Exports

```js
module.exports = mongoose.model('TrackingData', trackingDataSchema);
```

Used by virtually all route files and utility modules.

---

## Known Issues & Technical Debt

- No TTL index. Records accumulate indefinitely. For long-running deployments with many users, the collection could grow very large. A 2-year retention TTL would be reasonable.
- The `sessions` array grows unboundedly within a single day. The `maxSessionDurationMinutes` setting auto-stops the timer, but there is no limit on how many sessions can be logged per day.
