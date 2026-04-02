# public/manifest.json

## File Overview

**File path:** `public/manifest.json`

Web App Manifest for the legacy vanilla-JS SPA. Enables PWA installation for the older application version. References the legacy icon files (`icon512_rounded.png`, `icon512_maskable.png`) and uses the legacy theme colour (`#36d1c4` teal instead of the React SPA's `#10b981` green).

**Dependencies:** None.

---

## Properties

| Property | Value | Description |
|---|---|---|
| `name` | `"StandUP Tracker"` | Full app name (differs from React SPA: "StandUpTracker"). |
| `short_name` | `"StandUP"` | Short name (differs from React SPA: "StandUp"). |
| `description` | `"Track your standing time, stay healthy"` | App store description. |
| `start_url` | `"/app"` | Launch URL (same as React SPA). |
| `scope` | `"/"` | PWA scope covers entire origin. |
| `display` | `"standalone"` | Native-app display mode. |
| `background_color` | `"#0d1117"` | Splash screen background (slightly different from React SPA's `#0a0a0f`). |
| `theme_color` | `"#36d1c4"` | Legacy teal accent colour. |
| `icons` | 2 entries: `icon512_rounded.png` (any) + `icon512_maskable.png` (maskable) | Both 512×512 PNG. |

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR MERGE — see: frontend/public/manifest.json]` Two manifests exist for two generations of the app. The legacy manifest uses different names, colours, and icon files.
- `[CANDIDATE FOR REMOVAL]` Once the legacy HTML pages are removed, this manifest serves no purpose.
