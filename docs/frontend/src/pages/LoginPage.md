# frontend/src/pages/LoginPage.jsx

## File Overview

**File path:** `frontend/src/pages/LoginPage.jsx`

User login page. Handles the full login flow including initial credential submission, 2FA challenge (TOTP or email code), and the email verification pending screen. Reads `?verified=true` and `?expired=true` URL params to display contextual welcome/expiry messages.

**Dependencies (internal):**
- `../stores/useAuthStore`
- `../stores/useToastStore`
- `../lib/api` (`api`)

**Dependencies (external):**
- `react` (`useState`)
- `react-router-dom` (`Link`, `useNavigate`, `useSearchParams`)
- `lucide-react` (`Timer`, `Eye`, `EyeOff`, `Mail`, `CheckCircle`)

**Side effects when mounted:** None.

---

## State

| Field | Description |
|---|---|
| `login` | Username or email input value. |
| `password` | Password input value. |
| `showPw` | Password visibility toggle. |
| `code2fa` | 2FA code input value. |
| `needs2FA` | `null` (not needed) or `'totp'`/`'email'` (2FA method required). |
| `needsVerification` | Whether the user needs to verify their email before logging in. |
| `verificationEmail` | Email address to display in the verification pending screen. |
| `loading` | Async operation in progress. |

---

## Key Functions

### `handleSubmit(e)`

Submits credentials (and optionally a 2FA code) to `useAuthStore.login()`. On `requires2fa` response, switches to 2FA challenge mode. On `needsVerification` response, switches to the verification pending screen. On success, navigates to `/app`.

### `handleResendVerification()`

Calls `POST /api/auth/resend-verification` to resend the verification email.

---

## Exports

| Export | Description |
|---|---|
| `default LoginPage` | Mounted at `/login` in `App.jsx`. |

---

## Known Issues & Technical Debt

- The 2FA input is a plain text field regardless of `needs2FA` type. A numeric-only input would be better for TOTP codes.
