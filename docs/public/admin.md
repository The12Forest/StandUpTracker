# public/admin.html

## File Overview

**File path:** `public/admin.html`

Legacy vanilla-JS admin panel page. Multi-tab admin dashboard (Dashboard, Users, Logs, Settings) driven by inline JavaScript. Communicates with the API using a Bearer token from `localStorage`. All rendered content is built by JavaScript after the page loads.

**Dependencies:**
- `/css/style.css`
- `/js/theme.js`
- Google Fonts

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy page superseded by `frontend/src/pages/AdminPage.jsx`.
- Uses `localStorage` for token storage rather than HttpOnly cookies.
- All admin functionality is duplicated in the React SPA with significantly more features.
