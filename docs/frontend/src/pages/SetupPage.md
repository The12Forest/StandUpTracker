# frontend/src/pages/SetupPage.jsx

## File Overview

**File path:** `frontend/src/pages/SetupPage.jsx`

First-launch setup wizard. Shown when `isSetupComplete()` returns false. Guides the admin through four steps: creating the super_admin account, configuring SMTP, setting the application URL/name/port, and confirming all settings before submitting. Includes an SMTP connection test button. On completion, the session token is stored and the user is redirected to `/app`.

**Dependencies (internal):**
- `../lib/api` (`api`, `setToken`)

**Dependencies (external):**
- `react` (`useState`)
- `lucide-react` (`Shield`, `Mail`, `Server`, `CheckCircle`, `ChevronRight`, `ChevronLeft`, `Loader2`, `Wifi`)

**Side effects when mounted:** None.

---

## Constants

| Constant | Description |
|---|---|
| `STEPS` | Array of four step labels: `['Admin Account', 'Email / SMTP', 'Application', 'Confirm']`. |

---

## State

| Field | Description |
|---|---|
| `step` | Current step index (0–3). |
| `loading` | Final submission in progress. |
| `error` | Validation or submission error string. |
| `smtpTestResult` | `{ success, message }` from SMTP test. |
| `smtpTesting` | SMTP test in progress. |
| `form` | All form values: username, email, password, confirmPassword, all SMTP fields, appUrl, appName, serverPort, sessionSecure. |

---

## Key Functions

### `validateStep()`

Client-side validation for Step 0 only (username regex `^[a-zA-Z0-9_]{3,30}$`, email format, password length ≥ 8, password match). Steps 1–2 have no client-side validation.

### `testSmtp()`

POSTs to `POST /api/onboarding/test-smtp` with current SMTP settings. Shows a success or failure indicator.

### `handleSubmit()`

POSTs to `POST /api/onboarding/setup` with all form data. On success, stores the session token and calls `window.location.href = '/app'` for a hard redirect (not React Router navigate) to ensure the app reinitialises with the new setup state.

---

## Exports

| Export | Description |
|---|---|
| `default SetupPage` | Mounted at `/setup` in `App.jsx`. Redirected to `/app` if setup is already complete. |

---

## Known Issues & Technical Debt

- The `appUrl` default uses `window.location.origin`, which is correct for detecting the current URL but assumes the server will be accessible at the same origin. In containerised deployments the app URL may differ.
- `handleSubmit` uses `window.location.href` rather than React Router `navigate` — this causes a full page reload which is intentional (to re-run the setup status check) but could be handled more gracefully.
