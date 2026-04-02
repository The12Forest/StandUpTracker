# frontend/index.html

## File Overview

**File path:** `frontend/index.html`

The single HTML entry point for the Vite-powered React SPA. Vite replaces the `<script type="module" src="/src/main.jsx">` tag at build time with the hashed bundle filenames. The file sets up PWA metadata, links the Web App Manifest, establishes font preconnects to Google Fonts (Inter and JetBrains Mono), and provides the `<div id="root">` mount point for React.

**Dependencies:**
- `frontend/public/manifest.json` (linked via `<link rel="manifest">`)
- `https://fonts.googleapis.com` (Inter 400/500/600/700, JetBrains Mono 500/700)
- `frontend/src/main.jsx` (loaded as ES module)

**Side effects when loaded:** None beyond standard browser HTML parsing.

---

## Structure

| Element | Description |
|---|---|
| `<meta charset="UTF-8">` | Character encoding declaration. |
| `<meta name="viewport">` | Mobile responsive viewport. |
| `<meta name="theme-color" content="#0a0a0f">` | PWA/browser chrome colour matching the Zen dark palette. |
| `<link rel="manifest">` | Points to `/manifest.json` for PWA installation. |
| `<title>StandUpTracker</title>` | Default browser tab title (overridden at runtime by `useDynamicFavicon`). |
| Font preconnect links | Two `<link rel="preconnect">` tags to `fonts.googleapis.com` and `fonts.gstatic.com` to speed up font loading. |
| Google Fonts stylesheet | Loads Inter (wght 400–700) and JetBrains Mono (wght 500 and 700). |
| `<div id="root">` | React mount point. |
| `<script type="module" src="/src/main.jsx">` | Vite entry point. |

---

## Known Issues & Technical Debt

- Google Fonts are loaded from an external CDN; an offline or self-hosted deployment will fall back to system fonts silently. The PWA's offline capability does not cache these font requests.
- No `<link rel="icon">` is set in this file; the favicon is injected dynamically by `useDynamicFavicon.js` at runtime.
