# public/register.html

## File Overview

**File path:** `public/register.html`

Legacy vanilla-JS registration page. Glass-morphism auth card with username, email, and password fields. Submits to `POST /api/auth/register` with a Bearer token from `localStorage`. On success, redirects to `/app`. Shows an email verification pending card if the server returns `needsVerification`.

**Dependencies:**
- `/css/style.css`
- `/js/theme.js`
- Google Fonts

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy page superseded by `frontend/src/pages/RegisterPage.jsx`.
- Uses `localStorage` for token storage rather than HttpOnly cookies.
