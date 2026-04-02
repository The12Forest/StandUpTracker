# public/js/theme.js

## File Overview

**File path:** `public/js/theme.js`

Legacy theme engine for the vanilla-JS SPA. Wrapped in an IIFE. Reads the stored theme preference from `localStorage` (key `sut_theme`) or the `theme` field in the `sut_user` JSON object, applies it immediately via `document.documentElement.setAttribute('data-theme', ...)`, listens for system colour-scheme changes, and exposes a global `window.changeTheme(theme)` function that persists the new preference and updates the server via `PUT /api/auth/profile`.

**Dependencies:**
- `localStorage` (`sut_token`, `sut_user`, `sut_theme`)
- `window.matchMedia` (browser built-in)
- `/api/auth/profile` endpoint (for server persistence)

**Side effects when loaded:** Applies the stored theme to `document.documentElement` synchronously on page load.

---

## Functions

### `getStoredTheme()` (private)

**Signature:** `function getStoredTheme(): string`

**Returns:** The stored theme string (`'dark'`, `'light'`, or `'system'`). Reads `sut_user.theme`, falling back to `sut_theme` localStorage key, defaulting to `'dark'`.

### `applyTheme(theme)` (private)

**Signature:** `function applyTheme(theme: string): void`

**Description:** If `theme === 'system'`, reads `prefers-color-scheme` and applies `'dark'` or `'light'`. Otherwise applies the theme string directly to `data-theme`.

### `window.changeTheme(theme)` (global)

**Signature:** `async function changeTheme(theme: string): Promise<void>`

**Description:** Saves the theme to `sut_theme` in `localStorage`, applies it, and PUTs to `/api/auth/profile` to persist the preference on the server. Errors are silently swallowed.

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy file used only by the HTML pages in `public/`. The React SPA does not use this theme system (it uses Tailwind's dark-mode utilities and always applies the dark Zen colour palette).
- `window.changeTheme` is a global function, which is an anti-pattern that pollutes the global namespace.
- The theme is stored in two separate `localStorage` keys (`sut_user.theme` and `sut_theme`), creating potential inconsistency if they diverge.
