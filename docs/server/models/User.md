# server/models/User.js

## File Overview

**File path:** `server/models/User.js`

Defines the Mongoose model for user accounts. This is the central model of the application. It stores authentication credentials, role, email verification state, TOTP and email 2FA state, user preferences, statistics, active timer state, push notification preferences, and soft-delete fields.

**Dependencies (external):**
- `mongoose`
- `uuid` (`v4`)

**Side effects when loaded:**
- Registers the `User` model and all of its indexes.
- Registers a `pre('save')` hook that automatically promotes the first registered user to `super_admin` with a verified email.

---

## Classes & Models

### `User`

**Collection name:** `users`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `userId` | `String` | No | `uuidv4()` | Globally unique UUID identifier |
| `username` | `String` | Yes (unique) | — | Display name (3-30 chars, alphanumeric/underscore) |
| `email` | `String` | Yes (unique) | — | Lowercase email address |
| `passwordHash` | `String` | Yes | — | Argon2 password hash |
| `role` | `String` (enum) | No | `'user'` | `user`, `moderator`, `admin`, `super_admin` |
| `emailVerified` | `Boolean` | No | `false` | Whether the email has been verified |
| `emailVerifyToken` | `String` | No | — | One-time token sent in verification email |
| `emailVerifyExpires` | `Date` | No | — | Expiry for the verification token |
| `totpEnabled` | `Boolean` | No | `false` | Whether TOTP 2FA is active |
| `totpSecret` | `String` | No | — | Base32 TOTP secret key |
| `totpRecoveryCodes` | `[String]` | No | — | One-time recovery codes (consumed on use) |
| `email2faEnabled` | `Boolean` | No | `false` | Whether email 2FA is active |
| `email2faCode` | `String` | No | — | Argon2 hash of the current email 2FA code |
| `email2faExpires` | `Date` | No | — | Expiry for the email 2FA code |
| `pendingEmail` | `String` | No | — | New email address awaiting confirmation |
| `pendingEmailToken` | `String` | No | — | Token sent to confirm email change |
| `pendingEmailExpires` | `Date` | No | — | Expiry for the email change token |
| `theme` | `String` (enum) | No | `'dark'` | UI theme preference: `dark`, `light`, `system` |
| `dailyGoalMinutes` | `Number` | No | `60` | User's personal daily standing goal in minutes |
| `active` | `Boolean` | No | `true` | False means the account is deactivated |
| `impersonatedBy` | `String` | No | — | userId of the admin currently impersonating (legacy field) |
| `lastActiveAt` | `Date` | No | — | Last time the user made an authenticated request |
| `blockedUntil` | `Date` | No | — | Temporary suspension expiry; account remains `active: true` |
| `geminiOptIn` | `Boolean` | No | `false` | Whether the user has opted into AI advice features |
| `canChangeUsername` | `Boolean` | No | `true` | Whether the user is allowed to change their own username |
| `deletedAt` | `Date` | No | `null` | Soft-delete timestamp |
| `originalUsername` | `String` | No | `null` | Username before soft-delete rename |
| `originalEmail` | `String` | No | `null` | Email before soft-delete rename |
| `pushEnabled` | `Boolean` | No | `false` | Whether push notifications are active |
| `pushPreferences` | Object | No | all `true` | Per-type push opt-in flags (see below) |
| `standupReminderTime` | `String` | No | `'12:00'` | HH:MM UTC time for daily standup reminder |
| `timerRunning` | `Boolean` | No | `false` | Server-authoritative timer state |
| `timerStartedAt` | `Date` | No | `null` | When the current timer session began |
| `totalStandingSeconds` | `Number` | No | `0` | All-time accumulated standing seconds |
| `totalDays` | `Number` | No | `0` | Number of days where the goal was met |
| `currentStreak` | `Number` | No | `0` | Current consecutive goal-met days |
| `bestStreak` | `Number` | No | `0` | All-time best consecutive goal-met days |
| `level` | `Number` | No | `1` | Gamification level (1-10+) |
| `createdAt` | `Date` | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Auto | — | Mongoose timestamp |

**`pushPreferences` keys (all `Boolean`, default `true`):**
`standup_reminder`, `streak_at_risk`, `friend_request`, `level_up`, `daily_goal_reached`, `report_warning`, `report_cleared`, `admin_report_alert`

---

## Pre-save Hook

The `pre('save')` hook fires for new documents only. If the User collection has zero documents, the first user is automatically assigned `role: 'super_admin'` and `emailVerified: true`, bypassing the normal email verification flow.

---

## Exports

```js
module.exports = mongoose.model('User', userSchema);
```

---

## Known Issues & Technical Debt

- `impersonatedBy` is a legacy field that predates the session-based impersonation system. It is no longer written but still exists on the schema.
- The `totpSecret` and `email2faCode` fields store sensitive data in plaintext (other than `email2faCode` which is an Argon2 hash). `totpSecret` should ideally be encrypted at rest.
- No index on `timerRunning: true`, which is used in the leaderboard query to find all users with active timers. For large user counts this becomes a full collection scan.
