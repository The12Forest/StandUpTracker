# frontend/src/main.jsx

## File Overview

**File path:** `frontend/src/main.jsx`

The React application bootstrap file. It mounts the root `<App>` component into the `#root` DOM element using React 19's `createRoot` API with `StrictMode` enabled, imports the global CSS, and registers the PWA service worker (`/sw.js`) after the window load event.

**Dependencies (internal):**
- `./index.css` (global Tailwind + design token styles)
- `./App.jsx`

**Dependencies (external):**
- `react` (`StrictMode`)
- `react-dom/client` (`createRoot`)

**Side effects when executed:**
- Renders the React tree into `#root`.
- Registers `/sw.js` as the service worker (asynchronously, after `window load`).

---

## Variables & Constants

None at module level.

---

## Functions & Methods

### Service worker registration (inline)

**Signature:** Inline `if ('serviceWorker' in navigator)` block with a `window.addEventListener('load', ...)` callback.

**Description:** Checks for service worker support, then registers `/sw.js` after the page has fully loaded. Registration failures are silently caught (`.catch(() => {})`).

**Side effects:** Registers the PWA service worker, enabling offline fallback and push notification handling.

---

## Exports

None (side-effect-only entry point).

---

## Known Issues & Technical Debt

- Registration errors are completely silenced (`.catch(() => {})`). A failed service worker registration (e.g. wrong MIME type, scope issue) will produce no visible feedback.
- `StrictMode` causes effects and some lifecycle hooks to run twice in development, which is intentional but may cause confusion when debugging timer state or socket connections.
