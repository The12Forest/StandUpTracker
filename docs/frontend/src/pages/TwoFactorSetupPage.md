# frontend/src/pages/TwoFactorSetupPage.jsx

## File Overview

**File path:** `frontend/src/pages/TwoFactorSetupPage.jsx`

A full-screen page shown when `user.needs2faSetup` is true (admin has enforced 2FA for all users). Presents two enrollment options: TOTP authenticator app or email-based 2FA. For TOTP, fetches a setup package (secret + QR code), displays the QR code, and prompts for a verification code before enabling. For email 2FA, enables it immediately. After either method is enabled, `refreshUser()` is called and the router will redirect away from this page (since `needs2faSetup` will be false).

**Dependencies (internal):**
- `../stores/useAuthStore`
- `../stores/useToastStore`
- `../lib/api` (`api`)
- `../components/BentoCard` (`BentoCard`)

**Dependencies (external):**
- `react` (`useState`)
- `lucide-react` (`Shield`, `Key`, `Mail`)

**Side effects when mounted:** None.

---

## State

| Field | Description |
|---|---|
| `method` | `null`, `'totp'`, or `'email'` — selected enrollment method. |
| `totpSetup` | `{ qrCode, secret }` returned from the TOTP setup endpoint. |
| `totpCode` | User-entered 6-digit TOTP code. |
| `loading` | Any async operation in progress. |

---

## Key Functions

- `setupTOTP()` — POSTs to `POST /api/auth/2fa/totp/setup`, stores `totpSetup`.
- `enableTOTP()` — POSTs to `POST /api/auth/2fa/totp/enable` with the entered code, then calls `refreshUser()`.
- `enableEmail2FA()` — POSTs to `POST /api/auth/2fa/email/enable`, then calls `refreshUser()`.

---

## Exports

| Export | Description |
|---|---|
| `default TwoFactorSetupPage` | Mounted at `/2fa-setup` in `App.jsx`. All other routes redirect here when `user.needs2faSetup` is true. |

---

## Known Issues & Technical Debt

- There is no "skip" option; users are trapped on this page until they enrol. This is intentional (admin enforcement) but should be clearly communicated.
- The TOTP secret is shown below the QR code as plain text; this is useful for users who cannot scan QR codes but represents a security consideration if the page is screenshotted.
