# frontend/src/components/ToastContainer.jsx

## File Overview

**File path:** `frontend/src/components/ToastContainer.jsx`

Fixed-position toast notification renderer. Reads the active toast queue from `useToastStore` and renders each toast as a pill with a type-specific icon, colour scheme, message, and manual close button. Toasts slide in from the right via the `toast-in` CSS animation defined in `index.css`.

**Dependencies (internal):**
- `../stores/useToastStore`

**Dependencies (external):**
- `lucide-react` (`CheckCircle`, `XCircle`, `AlertTriangle`, `Info`, `X`)

**Side effects when mounted:** None.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `ICONS` | `object` | Maps toast type strings to Lucide icon components: `success` → `CheckCircle`, `error` → `XCircle`, `warn` → `AlertTriangle`, `info` → `Info`. |
| `COLORS` | `object` | Maps toast type strings to Tailwind border + background colour classes for each variant. |

---

## Functions & Methods

### `ToastContainer()` (default export)

**Signature:** `export default function ToastContainer(): JSX.Element`

**Description:** Renders a fixed `<div>` at `top-4 right-4 z-50` containing a vertical stack of toast items. For each toast in the store:
- Selects an icon component from `ICONS` (falls back to `Info`).
- Applies colour classes from `COLORS` (falls back to `COLORS.info`).
- Renders a pill with `backdrop-blur-xl`, the icon, the message text, and a close button that calls `remove(t.id)`.
- Applies `toast-in` animation inline via `style={{ animation: 'toast-in 0.3s ease-out' }}`.

**Callers:** `App.jsx` (rendered globally at the root level, outside route layouts).

---

## Exports

| Export | Description |
|---|---|
| `default ToastContainer` | Rendered once in `App.jsx`'s `AppShell`. |

---

## Known Issues & Technical Debt

- The `toast-in` animation is applied via inline style string; there is no corresponding `toast-out` animation triggered on removal — toasts disappear instantly when `remove()` is called rather than fading out. The `toast-out` keyframe is defined in `index.css` but not wired up.
- All toasts are stacked without a maximum height; many simultaneous toasts will push off-screen.
