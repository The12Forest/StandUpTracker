# public/css/style.css

## File Overview

**File path:** `public/css/style.css`

The legacy design system stylesheet for the vanilla-JS SPA. Implements a Material 3 / Glassmorphism visual language with full dark/light theme support via CSS custom properties and the `[data-theme="light"]` selector. Covers a comprehensive component library: buttons, forms, cards, navbar, modals, tables, toasts, charts, leaderboard rows, and responsive layouts. Applied to all legacy HTML pages (`index.html`, `login.html`, `register.html`, `admin.html`, `app.html`, `leaderboard.html`).

**Dependencies:** None (standalone CSS).

---

## Design Tokens (`:root`)

### Dark Theme (default)

| Variable | Value | Description |
|---|---|---|
| `--bg-base` | `#0a0e17` | Page background. |
| `--bg-surface` | `rgba(22,27,45,0.85)` | Card surface. |
| `--bg-surface-2` | `rgba(30,36,58,0.75)` | Secondary surface. |
| `--bg-card` | `rgba(25,32,55,0.6)` | Card background. |
| `--bg-input` | `rgba(15,20,35,0.8)` | Input background. |
| `--fg-primary` | `#e8eaf6` | Primary text. |
| `--fg-secondary` | `#8b92b0` | Secondary text. |
| `--fg-muted` | `#5a6280` | Muted text. |
| `--accent-1` | `#36d1c4` | Primary teal accent. |
| `--accent-2` | `#5b86e5` | Secondary blue accent. |
| `--accent-gradient` | `linear-gradient(135deg, #36d1c4, #5b86e5)` | Gradient for buttons/badges. |
| `--danger` | `#ef4444` | Error colour. |
| `--success` | `#22c55e` | Success colour. |
| `--warning` | `#f59e0b` | Warning colour. |
| `--glass-border` | `rgba(255,255,255,0.08)` | Glass card border. |
| `--glass-shadow` | `0 8px 32px rgba(0,0,0,0.4)` | Card drop shadow. |
| `--glass-blur` | `blur(20px)` | Backdrop blur. |
| `--radius-sm/md/lg/xl` | 8/14/20/28 px | Border radius scale. |
| `--transition` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` | Default transition curve. |
| `--font` | `'Inter', system-ui, ...` | Body font stack. |
| `--font-mono` | `'JetBrains Mono', ...` | Monospace font stack. |

### Light Theme (`[data-theme="light"]`)

Overrides `--bg-*` and `--fg-*` tokens for a light appearance; semantic and accent colours remain unchanged.

---

## Major Component Classes

| Class / Selector | Description |
|---|---|
| `.glass` | Glassmorphism container: blurred backdrop, glass border and shadow. |
| `.navbar` | Fixed top navigation bar with blur backdrop. |
| `.navbar-brand` | Logo + brand name link. |
| `.card`, `.bento-card` | Legacy card containers (`.bento-card` is slightly different from the React SPA's version). |
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost` | Button variants. |
| `.form-input`, `.form-label`, `.form-group` | Form field styles. |
| `.modal-overlay`, `.modal` | Full-screen overlay modal. |
| `.table-container`, `.data-table` | Styled data table. |
| `.toast-container`, `.toast`, `.toast-success`, `.toast-error`, `.toast-warn` | Toast notifications. |
| `.timer-display` | Large monospace timer. |
| `.progress-bar`, `.progress-fill` | Goal progress bar. |
| `.stat-card` | Metric card for stats display. |
| `.leaderboard-row`, `.leaderboard-rank` | Leaderboard entry styling. |
| `.sidebar` | Legacy sidebar (used in `app.html`). |
| `.auth-container`, `.auth-card` | Login/register page layout. |
| `.badge` | Small label pill. |
| `.spinner` | CSS loading spinner. |

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` This stylesheet is only used by the legacy HTML pages. Once those pages are removed, this file becomes dead code.
- The `.bento-card` class in this file is visually different from the `.bento-card` in `frontend/src/index.css`; the same class name serves different designs in the two code generations.
- The accent colour (`--accent-1: #36d1c4` teal) differs from the React SPA (`--color-accent-500: #10b981` green), creating visual inconsistency for users who encounter both.
