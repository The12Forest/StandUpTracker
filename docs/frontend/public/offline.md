# frontend/public/offline.html

## File Overview

**File path:** `frontend/public/offline.html`

A self-contained fallback page served by the service worker when the user navigates to any page while offline. The entire page is inline-styled (no external stylesheet dependencies) so it renders correctly without a network connection. It displays a Wifi-off SVG icon, an informational message, and a "Try Again" button that reloads the page.

**Dependencies:** None (all styles are inline `<style>` blocks).

**Side effects:** None beyond standard browser rendering.

---

## Selectors & Layout

| Selector | Description |
|---|---|
| `* { margin: 0; padding: 0; box-sizing: border-box; }` | Global reset. |
| `body` | Full-viewport flexbox, centred content, dark background `#0a0a0f`, light grey text `#d4d4d8`. |
| `.card` | Glassmorphism-style card: semi-transparent dark background, subtle border, 1rem border-radius, max-width 26rem, text-centred. |
| `.icon` | Circular container with `#10b981` tinted background, holds the Wifi-off SVG. |
| `h1` | White heading: font-size 1.25rem, bold. |
| `p` | Muted body text: font-size 0.875rem, `#71717a`. |
| `button` | Accent green (`#10b981`) pill button; hover lightens to `#34d399`; active scales to 0.97. |

---

## Content

- Heading: "StandUpTracker"
- Body text: "You are offline — please check your connection and try again."
- Button: "Try Again" — calls `location.reload()` on click.

---

## Known Issues & Technical Debt

- The colour values are hardcoded inline rather than referencing the design tokens in `index.css`. If the brand colours change, this file must be updated manually.
- The button uses an inline `onclick` attribute (`onclick="location.reload()"`) rather than a script block, which is a minor CSP concern in strict Content-Security-Policy environments.
