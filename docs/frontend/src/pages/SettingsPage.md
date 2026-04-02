# frontend/src/pages/SettingsPage.jsx

## File Overview

**File path:** `frontend/src/pages/SettingsPage.jsx`

User settings page with sections for: profile (daily goal, username), account security (email change, password change), two-factor authentication (TOTP setup/disable, email 2FA enable/disable), push notification management (toggle, per-type preferences, reminder time), and optional AI advice opt-in.

**Dependencies (internal):**
- `../stores/useAuthStore`
- `../stores/useToastStore`
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)
- `../lib/pushNotifications` (`isPushSupported`, `subscribeToPush`, `unsubscribeFromPush`, `getPermissionState`)

**Dependencies (external):**
- `react` (`useState`, `useEffect`, `useCallback`)
- `lucide-react` (`Settings`, `User`, `Lock`, `Shield`, `Key`, `Mail`, `Sparkles`, `Copy`, `Bell`, `Clock`)

**Side effects when mounted:** Populates form state from `user` object in `useAuthStore`.

---

## Key State

- `profile` — `{ dailyGoalMinutes, geminiOptIn }`
- `pw` — `{ current, new, confirm }`
- `newEmail`, `emailPassword`, `email2faPassword`
- `totpSetup`, `totpCode`, `totpDisablePassword`
- `pushEnabled`, `pushLoading`, `pushError`, `pushPrefs`, `reminderTime`
- `goalError`, `newUsername`, `usernameError`, `usernameSaving`

---

## Key Operations

| Operation | Endpoint |
|---|---|
| Save daily goal | `PUT /api/auth/profile` |
| Change username | `PUT /api/auth/username` |
| Change email | `POST /api/auth/change-email` |
| Change password | `PUT /api/auth/password` |
| Setup TOTP | `POST /api/auth/2fa/totp/setup` |
| Enable TOTP | `POST /api/auth/2fa/totp/enable` |
| Disable TOTP | `POST /api/auth/2fa/totp/disable` |
| Enable email 2FA | `POST /api/auth/2fa/email/enable` |
| Disable email 2FA | `POST /api/auth/2fa/email/disable` |
| Subscribe push | `subscribeToPush()` → `POST /api/notifications/push/subscribe` |
| Unsubscribe push | `unsubscribeFromPush()` → `POST /api/notifications/push/unsubscribe` |
| Save push preferences | `PUT /api/notifications/push/preferences` |
| Save reminder time | `PUT /api/auth/profile` (standup reminder time field) |

---

## Exports

| Export | Description |
|---|---|
| `default SettingsPage` | Mounted at `/settings` in `App.jsx`. |

---

## Known Issues & Technical Debt

- The TOTP QR code is rendered as a plain `<img>` with the `qrCode` data URI from the server. If the server returns an SVG or a different format, the image tag handles it without explicit type validation.
- Recovery codes are displayed once (copy-paste only) and are not stored locally. If the user closes the modal without copying, they are lost.
- Daily goal validation (`goalError`) only checks for < 1, but the server enforces a more complex range that may differ.
