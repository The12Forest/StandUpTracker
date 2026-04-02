# frontend/src/hooks/useDynamicFavicon.js

## File Overview

**File path:** `frontend/src/hooks/useDynamicFavicon.js`

Custom React hook that dynamically updates the browser tab favicon and page title to reflect the current timer state. When the timer is running, the favicon becomes a green circle with an "S" and the title changes to "⏱ Standing — StandUpTracker". When idle, the favicon becomes a grey version and the title resets to "StandUpTracker".

**Dependencies (internal):**
- `../stores/useTimerStore`

**Dependencies (external):**
- `react` (`useEffect`, `useRef`)

**Side effects when mounted:**
- Locates or creates the `<link rel="icon">` element in the document head.
- Updates `linkRef.current.href` and `document.title` whenever `running` changes.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `FAVICONS` | `{ idle: string, active: string }` | Pre-generated SVG data URIs. `idle` uses `#6b6b8a` (zen-500), `active` uses `#10b981` (accent-500). Generated once at module load via `createFaviconSvg`. |

---

## Functions & Methods

### `createFaviconSvg(color)` (module-level helper)

**Signature:** `function createFaviconSvg(color: string): string`

**Returns:** A `data:image/svg+xml,...` URI string containing a 32×32 SVG with a filled circle and centred bold "S" text.

**Description:** Called once per colour at module load time to build the two favicon data URIs. Private (not exported).

**Callers:** Module-level `FAVICONS` constant initialisation.

---

### `useDynamicFavicon()` (default export)

**Signature:** `export default function useDynamicFavicon(): void`

**Description:** Hook that:
1. On mount, locates an existing `<link rel="icon">` in the document head or creates and appends one. Stores the reference in `linkRef`.
2. On every change to `running`, updates `linkRef.current.href` (idle or active favicon) and `document.title`.

**Side effects:** Mutates `document.head` (adds a link element if none exists) and `document.title`.

**Callers:** `App.jsx` (`AppShell` component, mounted globally).

---

## Exports

| Export | Description |
|---|---|
| `default useDynamicFavicon` | Mounted once in `AppShell`; applies to all pages. |

---

## Known Issues & Technical Debt

- The FAVICONS object is generated at module load time (not inside a React render), meaning two SVG data URIs are created even if the hook is never used.
- The hook finds any `<link rel~='icon'>` element; if a third-party library also injects a favicon link, there may be a conflict.
