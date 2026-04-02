# public/index.html

## File Overview

**File path:** `public/index.html`

The legacy marketing/landing page for StandUpTracker. This is a server-rendered HTML page (not part of the React SPA) that serves as the public-facing homepage. It includes a navbar with Leaderboard and Login links, a hero section, a features section, a "how it works" diagram, and a footer. It loads the legacy CSS and JavaScript files from `public/css/style.css`, `public/js/app.js`, `public/js/features.js`, `public/js/diagram.js`, and `public/js/theme.js`.

**Dependencies:**
- `/css/style.css`
- `/js/theme.js`
- `/js/features.js`
- `/js/diagram.js`
- Google Fonts (Inter, JetBrains Mono)
- `/manifest.json` (legacy)

**Side effects when loaded:** `theme.js` runs immediately and applies the stored theme.

---

## Structure

| Section | Description |
|---|---|
| Navbar | Brand logo, Leaderboard link, Login link, hamburger toggle for mobile. |
| Hero | Headline, subheadline, CTA buttons (Get Started / Leaderboard). |
| Features grid | Cards describing core features (real-time sync, streaks, leaderboard, AI advice, etc.). |
| How it works | Step-by-step numbered diagram. |
| Footer | Copyright notice and links. |

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` This is a legacy page from the vanilla JS era. The React SPA (`frontend/`) has replaced the application UI. This page may be superseded once all traffic is directed to the React app.
- The page links to `/login` and `/register` which currently serve the legacy HTML pages, not the React SPA routes.
