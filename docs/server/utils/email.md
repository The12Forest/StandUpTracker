# server/utils/email.js

## File Overview

**File path:** `server/utils/email.js`

Provides all outgoing email functionality: a lazy-initialized Nodemailer transporter that recreates itself when SMTP settings change, email verification emails, 2FA code emails, and an SMTP connection test function used by the setup wizard.

**Dependencies (internal):**
- `../models/Settings`
- `./settings` (`getSmtpConfig`, `getAppConfig`)

**Dependencies (external):**
- `nodemailer`

**Side effects when loaded:**
- Declares module-level `transporter` (null) and `lastSmtpHash` ('').

---

## Variables & Constants

| Variable | Type | Description |
|---|---|---|
| `transporter` | `nodemailer.Transporter \| null` | Cached Nodemailer transporter instance. Recreated when SMTP config changes. |
| `lastSmtpHash` | `string` | Hash of the last SMTP config used to build the transporter. Used for change detection. |

---

## Functions & Methods

### `smtpHash(smtp)`

**Signature:** `function smtpHash(smtp): string`

**Description:** Returns a colon-joined string of `host:port:user:pass:secure` for fast change detection. Private (not exported).

### `getTransporter()`

**Signature:** `async function getTransporter(): Promise<nodemailer.Transporter>`

**Description:** Returns the cached transporter if the SMTP config hash matches. Otherwise creates a new transporter with:
- Port 465: `secure: true`
- Port 587 or `smtpSecure`: `requireTLS: true`
- All other ports: `secure: false`
- Always: `tls.rejectUnauthorized: false`
- Debug logging enabled if `debugMode` setting is true

**Side effects:** Updates `transporter` and `lastSmtpHash`.

### `resetTransporter()`

**Signature:** `function resetTransporter(): void`

**Description:** Clears the cached transporter and hash, forcing recreation on the next call. Exported for use by admin settings routes when SMTP configuration changes.

**Called by:** `sendMail()` (on verify failure), admin routes that update SMTP settings.

### `sendMail(to, subject, html)`

**Signature:** `async function sendMail(to: string, subject: string, html: string): Promise<any>`

**Description:** Core mail dispatch function. Throws `SMTP_NOT_CONFIGURED` error if `smtp.host` is empty. Calls `transporter.verify()` before sending — on failure, resets the transporter and throws a human-readable error with specific messages for `ECONNREFUSED` and auth failure (535).

**Called by:** `sendVerificationEmail`, `send2faCode`.

### `sendVerificationEmail(email, token)`

**Signature:** `async function sendVerificationEmail(email: string, token: string): Promise<any>`

**Description:** Builds an HTML verification email with a link to `/api/auth/verify-email?token=...`. Uses `appUrl` and `appName` from `getAppConfig()`. Token is URL-encoded.

**Called by:** `server/routes/auth.js` on register and resend-verification.

### `send2faCode(email, code)`

**Signature:** `async function send2faCode(email: string, code: string): Promise<any>`

**Description:** Sends a styled HTML email containing the 6-digit 2FA code. Notes 10-minute expiry in the email body.

**Called by:** `server/routes/auth.js` on email-2FA login challenge.

### `testSmtpConnection(smtpConfig)`

**Signature:** `async function testSmtpConnection(smtpConfig: object): Promise<boolean>`

**Description:** Creates a throwaway transporter with the provided raw config (does NOT update the cached transporter) and calls `.verify()`. Returns `true` on success; throws on failure.

**Called by:** `server/routes/onboarding.js`, `server/routes/admin.js`.

---

## Exports

```js
module.exports = { sendMail, sendVerificationEmail, send2faCode, resetTransporter, testSmtpConnection };
```

---

## Known Issues & Technical Debt

- `tls.rejectUnauthorized: false` is hardcoded in both `getTransporter()` and `testSmtpConnection()`. This disables TLS certificate verification globally for all SMTP connections, making the server vulnerable to man-in-the-middle attacks on email traffic. There is no admin setting to override this.
- The `smtpHash` function includes the password in plain text in the hash string. While it is only compared (not stored persistently), care should be taken if logs ever capture this value.
- Email HTML templates use inline styles and a teal color (`#36d1c4`) that matches the legacy UI, not the React frontend's green (`#10b981`).
