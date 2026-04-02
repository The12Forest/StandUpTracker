# frontend/src/components/BentoCard.jsx

## File Overview

**File path:** `frontend/src/components/BentoCard.jsx`

Exports three reusable layout primitives that form the visual foundation of the "Bento-Zen" design system used throughout all pages.

**Dependencies (internal):** None.

**Dependencies (external):** None (relies on Tailwind utility classes and the `.bento-card` / `.bento-pulse` CSS classes from `index.css`).

**Side effects when mounted:** None.

---

## Functions & Methods

### `BentoCard({ children, className?, pulse?, ...props })` (named export)

**Signature:** `export function BentoCard({ children, className, pulse, ...props }): JSX.Element`

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | Card content. |
| `className` | `string` | `''` | Additional Tailwind classes appended to the base `.bento-card` class. |
| `pulse` | `boolean` | `false` | If true, adds `.bento-pulse` which applies the glowing animation (used on the timer card when running). |
| `...props` | `any` | — | Spread onto the root `<div>`, allowing `onClick`, `style`, etc. |

**Description:** Renders a `<div>` with the `.bento-card` CSS class (glassmorphism card from `index.css`). All pages use this as the primary container card.

---

### `BentoGrid({ children, className? })` (named export)

**Signature:** `export function BentoGrid({ children, className }): JSX.Element`

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | Grid items (typically `BentoCard` instances). |
| `className` | `string` | `''` | Additional Tailwind classes. |

**Description:** Renders a responsive CSS grid: 1 column on mobile, 2 on medium screens, 3 on extra-large screens. Gap of 4 (1rem).

---

### `StatCard({ label, value, sub?, icon? })` (named export)

**Signature:** `export function StatCard({ label, value, sub, icon: Icon }): JSX.Element`

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Small uppercase label above the value (e.g. "Total Days"). |
| `value` | `string \| number` | — | Large bold value. |
| `sub` | `string` | — | Optional small subtitle below the value. |
| `icon` | `React component` | — | Optional Lucide icon component rendered in an accent-coloured pill. |

**Description:** A specialised `BentoCard` layout for displaying a single metric. Icon (if provided) sits left of the label+value+sub stack.

---

## Exports

```js
export { BentoCard, BentoGrid, StatCard };
```

---

## Known Issues & Technical Debt

None. These are pure presentational components with no state or side effects.
