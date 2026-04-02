# server/models/Settings.js

## File Overview

**File path:** `server/models/Settings.js`

Defines the Mongoose model for the application's database-backed configuration store. All application settings (SMTP, JWT, feature flags, limits, AI config, etc.) are stored in this collection as key-value pairs. The model exposes static methods for reading, writing, and bulk-reading settings. A large `DEFAULTS` object defines default values and section groupings for the admin UI.

**Dependencies (external):**
- `mongoose`

**Side effects when loaded:** Registers the `Settings` model. The `DEFAULTS` object is stored on the model class as `Settings.DEFAULTS`.

---

## Classes & Models

### `Settings`

**Collection name:** `settings`

| Property | Type | Required | Description |
|---|---|---|---|
| `key` | `String` | Yes (unique) | Setting identifier string |
| `value` | `Mixed` | No | The current value (any JSON-serializable type) |
| `description` | `String` | No | Human-readable description shown in the admin console |
| `createdAt` | `Date` | Auto | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | Mongoose timestamp |

---

## DEFAULTS Reference

The `DEFAULTS` object defines all recognized settings, their defaults, descriptions, and section groupings. Sections are: `server`, `security`, `client`, `mail`, `auth`, `social`, `groups`, `emailAdmin`, `ai`, `enforcement`, `push`, `thresholds`, `scheduler`, `reporting`, `logging`.

Key defaults include:

| Key | Default | Section |
|---|---|---|
| `serverPort` | `3000` | server |
| `appUrl` | `'http://localhost:3000'` | server |
| `appName` | `'StandUpTracker'` | server |
| `maintenanceMode` | `false` | server |
| `jwtSecret` | `''` | security |
| `jwtExpiresIn` | `'7d'` | security |
| `sessionTimeoutDays` | `30` | security |
| `defaultDailyGoalMinutes` | `60` | client |
| `maxSessionDurationMinutes` | `480` | client |
| `requireEmailVerification` | `true` | auth |
| `registrationEnabled` | `true` | auth |
| `ollamaEnabled` | `false` | ai |
| `aiAdviceCooldownMinutes` | `30` | ai |
| `aiAdviceCacheDurationMinutes` | `30` | ai |
| `masterDailyGoalMinutes` | `60` | enforcement |
| `enforceDailyGoal` | `false` | enforcement |
| `enforce2fa` | `false` | enforcement |
| `reportThreshold` | `3` | reporting |
| `forgottenCheckoutThresholdHours` | `8` | scheduler |
| `logLevel` | `'INFO'` | logging |
| `minActivityThresholdMinutes` | `1` | thresholds |

---

## Static Methods

### `Settings.getAll()`

**Signature:** `static async getAll(): Promise<object>`

**Description:** Returns all settings as a flat object keyed by setting name. Merges the `DEFAULTS` base values with stored database values. Unknown stored keys are included with section `'general'`.

**Returns:** `object` — `{ [key]: { value, description, section } }`

---

### `Settings.get(key)`

**Signature:** `static async get(key: string): Promise<any>`

**Description:** Returns the value of a single setting. Reads from the database first; falls back to `DEFAULTS[key].value` if no database record exists.

**Returns:** The stored or default value, or `null` if neither exists.

---

### `Settings.set(key, value)`

**Signature:** `static async set(key: string, value: any): Promise<Document>`

**Description:** Upserts a setting in the database. Uses the default description from `DEFAULTS` if available.

**Returns:** The updated or created Mongoose document.

---

## Exports

```js
module.exports = mongoose.model('Settings', settingsSchema);
```

Used extensively throughout the server. Primary consumers are `server/utils/settings.js` (which adds an in-memory cache layer) and `server/routes/admin.js`.

---

## Known Issues & Technical Debt

- `jwtExpiresIn` is stored as a setting but the application now uses database-backed sessions, not JWT tokens. This setting is effectively unused.
- The `DEFAULTS` object is large (40+ keys) and defined inline in the model file. It would be cleaner in a separate `config/defaults.js` file.
