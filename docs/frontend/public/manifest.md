# frontend/public/manifest.json

## File Overview

**File path:** `frontend/public/manifest.json`

Web App Manifest for the React SPA. Enables "Add to Home Screen" / PWA installation on supported browsers and operating systems. Defines the app name, start URL, display mode, theme colours, and icon set.

**Dependencies:** None (static JSON).

**Side effects:** When the browser installs the PWA, it uses these values to create the app entry on the home screen or taskbar.

---

## Properties

| Property | Value | Description |
|---|---|---|
| `name` | `"StandUpTracker"` | Full application name displayed during install and in the OS app switcher. |
| `short_name` | `"StandUp"` | Abbreviated name shown under the home screen icon where space is limited. |
| `description` | `"Track your standing time with real-time sync"` | Short description for app store listings and install prompts. |
| `start_url` | `"/app"` | The URL opened when the PWA is launched from the home screen. |
| `display` | `"standalone"` | Hides the browser chrome so the app looks like a native application. |
| `background_color` | `"#0a0a0f"` | Splash screen background colour while the app loads. Matches `--color-zen-950`. |
| `theme_color` | `"#10b981"` | Browser UI chrome colour (address bar, notification bar). Matches `--color-accent-500`. |
| `icons[0]` | `{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }` | Standard home screen icon. |
| `icons[1]` | `{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }` | High-resolution icon for splash screens and larger displays. |

---

## Known Issues & Technical Debt

- The icon files `/icon-192.png` and `/icon-512.png` must exist in `frontend/public/` for PWA installation to succeed. Their absence will not break the app but will produce a browser console warning.
- No `maskable` purpose icon is declared. Without a maskable icon, Android's adaptive icon system will use the regular icon without safe-zone padding, potentially cropping it.
- This manifest differs from `public/manifest.json` (the legacy SPA): different `name` (`"StandUpTracker"` vs `"StandUP Tracker"`), `theme_color` (`#10b981` vs `#36d1c4`), and icon files. `[CANDIDATE FOR MERGE — see: public/manifest.json]`
