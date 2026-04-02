# public/login.html

## File Overview

**File path:** `public/login.html`

Legacy vanilla-JS login page. Renders a glass-morphism auth card with username/email and password fields, a 2FA code field (hidden until required), a "Remember me" checkbox, and a forgot password link. All API calls use `fetch` with a Bearer token from `localStorage`. On success, stores `sut_token` and `sut_user` in `localStorage` and redirects to `/app`.

**Dependencies:**
- `/css/style.css`
- `/js/theme.js`
- Google Fonts

**Side effects when loaded:** `theme.js` applies stored theme. Shows a "verified" success message if `?verified=true` is in the URL.

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy page superseded by `frontend/src/pages/LoginPage.jsx`. The React SPA handles `/login` as a client-side route.
- Stores the session token in `localStorage` (`sut_token`) — the React SPA uses HttpOnly cookies instead, which is more secure.
