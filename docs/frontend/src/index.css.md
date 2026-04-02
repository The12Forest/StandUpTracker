# frontend/src/index.css

## File Overview

**File path:** `frontend/src/index.css`

Global stylesheet for the React SPA. Uses Tailwind CSS v4's `@import "tailwindcss"` directive and the `@theme` block to define the custom design token palette ("Bento-Zen" design system). Beyond tokens, the file defines reusable component classes (`.bento-card`, `.glass-input`, `.btn-accent`, `.btn-ghost`, `.btn-danger`, `.timer-display`), custom scroll bar styling, and CSS keyframe animations for toasts and the pulsing bento card effect.

**Dependencies:**
- Tailwind CSS v4 (processed by `@tailwindcss/vite`)
- Google Fonts (Inter, JetBrains Mono) — loaded via `frontend/index.html`

**Side effects when loaded:** Applied globally to the entire application.

---

## Design Tokens (`@theme`)

### Zen Colour Scale (backgrounds and text)

| Token | Value | Description |
|---|---|---|
| `--color-zen-950` | `#0a0a0f` | Deepest background (page root). |
| `--color-zen-900` | `#111118` | Card background base. |
| `--color-zen-800` | `#1a1a24` | Input background, hover states. |
| `--color-zen-700` | `#25253a` | Card borders, dividers. |
| `--color-zen-600` | `#3a3a55` | Muted borders. |
| `--color-zen-500` | `#6b6b8a` | Muted/placeholder text. |
| `--color-zen-400` | `#9898b4` | Secondary text. |
| `--color-zen-300` | `#c4c4d8` | Body text. |
| `--color-zen-200` | `#e2e2ec` | Primary text. |
| `--color-zen-100` | `#f3f3f8` | Headings, high-contrast text. |

### Accent Colour (green)

| Token | Value | Description |
|---|---|---|
| `--color-accent-500` | `#10b981` | Primary accent (buttons, active states, icons). |
| `--color-accent-400` | `#34d399` | Hover/lighter accent. |
| `--color-accent-600` | `#059669` | Pressed/darker accent. |
| `--color-accent-glow` | `rgba(16, 185, 129, 0.15)` | Box-shadow glow for hover effects. |

### Semantic Colours

| Token | Value | Description |
|---|---|---|
| `--color-danger-500` | `#ef4444` | Error, destructive actions. |
| `--color-danger-400` | `#f87171` | Error hover. |
| `--color-warn-500` | `#f59e0b` | Warning states. |
| `--color-warn-400` | `#fbbf24` | Warning hover. |
| `--color-info-500` | `#3b82f6` | Info toasts. |

### Typography

| Token | Value | Description |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', 'Fira Code', ui-monospace, monospace` | Monospace stack for timer display and code. |

---

## Component Classes

### `.bento-card`

A glassmorphism card container with `bg-zen-900/80`, `backdrop-blur-xl`, `border border-zen-700/40`, `rounded-2xl`, and `p-6`. On hover, the border transitions to `border-accent-500/30` and adds a `box-shadow` glow using `--color-accent-glow`. Interactive children (buttons, links) have `position: relative; z-index: 1` to prevent click absorption by the card overlay.

### `.bento-pulse`

Applies the `bento-pulse` keyframe animation (3 s ease-in-out infinite), which oscillates the box-shadow glow between 20 px and 50 px intensity. Used on the timer card while the timer is running.

### `.glass-input`

Styled form input: semi-transparent dark background, subtle border, rounded-xl, focus ring using `accent-500`. Placeholder text is `zen-500`.

### `.btn-accent`

Primary call-to-action button: green background, dark text, hover lightens, active scales down to 0.97, disabled opacity 40%.

### `.btn-ghost`

Secondary/navigation button: no background by default, shows `zen-800/50` on hover. Text transitions from `zen-400` to `zen-100`.

### `.btn-danger`

Destructive action button: red background, white text, same active scale behaviour as `.btn-accent`.

### `.timer-display`

Applies JetBrains Mono font, `tabular-nums` variant (prevents layout shifts when digits change), and slight letter-spacing. Used for the large timer clock in `TimerPage`.

---

## Animations

### `@keyframes bento-pulse`

Oscillates `box-shadow` between a faint glow (`20px`) and a stronger glow (`50px`) over 3 seconds. Applied via `.bento-pulse`.

### `@keyframes toast-in`

Slides a toast in from the right (`translateX(100%)` → `translateX(0)`) while fading in. Duration/easing applied inline.

### `@keyframes toast-out`

Fades out and slides right (`opacity: 1` → `opacity: 0` + `translateX(50%)`). Applied when a toast is dismissed.

---

## Base Styles

- `body`: dark background (`bg-zen-950`), body text (`text-zen-200`), antialiased, Inter font, `min-height: 100vh`.
- `#root`: `min-height: 100vh`, flex column layout.
- Scrollbar: 6 px width, transparent track, `zen-700` thumb, `zen-600` on hover.

---

## Known Issues & Technical Debt

- The `toast-out` animation is defined but never directly referenced in CSS class rules; it must be applied via inline `style` in JSX or via additional utility classes.
