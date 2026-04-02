# frontend/src/pages/RegisterPage.jsx

## File Overview

**File path:** `frontend/src/pages/RegisterPage.jsx`

User registration page. Validates that the password is at least 8 characters, scavenges legacy localStorage data via `scavengeLegacyData()` and includes it in the registration request, then displays an email verification pending screen if the server requires email confirmation.

**Dependencies (internal):**
- `../stores/useAuthStore`
- `../stores/useToastStore`
- `../lib/migration` (`scavengeLegacyData`)

**Dependencies (external):**
- `react` (`useState`)
- `react-router-dom` (`Link`, `useNavigate`)
- `lucide-react` (`Timer`, `Eye`, `EyeOff`, `Mail`)

**Side effects when mounted:** None.

---

## State

| Field | Description |
|---|---|
| `username` / `email` / `password` | Form field values. |
| `showPw` | Password visibility toggle. |
| `loading` | Async operation in progress. |
| `registered` | Whether registration was successful and email verification is pending. |

---

## Key Functions

### `handleSubmit(e)`

Validates password length, calls `scavengeLegacyData()`, then calls `useAuthStore.register()`. On `needsVerification` response, shows the email check screen. On immediate success, navigates to `/app`.

---

## Exports

| Export | Description |
|---|---|
| `default RegisterPage` | Mounted at `/register` in `App.jsx`. |

---

## Known Issues & Technical Debt

- Client-side validation is limited to password length. Username and email format validation is only done server-side, so the user sees an error toast rather than an inline field error.
