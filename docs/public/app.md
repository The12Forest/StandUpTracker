# public/app.html

## File Overview

**File path:** `public/app.html`

Legacy vanilla-JS application page — the main timer and stats view from the pre-React era. Includes a navbar with links to all sections, a PWA manifest reference, and loads the complete legacy JavaScript stack. The actual timer logic, socket connection, and UI rendering are all in `public/js/app.js`.

**Dependencies:**
- `/css/style.css`
- `/js/theme.js`
- `/js/app.js`
- `/js/features.js`
- `/manifest.json` (legacy)
- Socket.io client (loaded via CDN or `/socket.io/socket.io.js`)
- Google Fonts

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy page superseded by `frontend/src/pages/TimerPage.jsx` and the React SPA.
- The `/app` route in the Express server may serve either this HTML file or the React SPA's `index.html` depending on build configuration; this creates ambiguity during the transition period.
