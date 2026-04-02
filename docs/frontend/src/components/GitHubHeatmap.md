# frontend/src/components/GitHubHeatmap.jsx

## File Overview

**File path:** `frontend/src/components/GitHubHeatmap.jsx`

A standalone SVG-based activity heatmap component styled after GitHub's contribution graph. Renders approximately 53 weeks of daily standing data as a grid of coloured cells, with month labels along the top and weekday labels on the left. Off-days are shown in a distinct purple tint. Supports both dark and light colour modes and configurable first day of week (Monday or Sunday).

**Dependencies (internal):** None.

**Dependencies (external):**
- `react` (`useMemo`)

**Side effects when mounted:** None.

---

## Variables & Constants

| Constant | Type | Description |
|---|---|---|
| `COLORS_DARK` | `string[]` | 5 GitHub-dark green shades: `['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']` (level 0–4). |
| `COLORS_LIGHT` | `string[]` | 5 GitHub-light green shades for light mode. |
| `DAY_LABELS_MONDAY` | `string[]` | Weekday row labels starting Monday: `['Mon', '', 'Wed', '', 'Fri', '', '']`. |
| `DAY_LABELS_SUNDAY` | `string[]` | Weekday row labels starting Sunday: `['', 'Mon', '', 'Wed', '', 'Fri', '']`. |
| `MONTH_NAMES` | `string[]` | 3-letter month abbreviations Jan–Dec. |
| `OFF_DAY_COLOR_DARK` | `string` | `'#2d1f3d'` — dark purple for off-day cells in dark mode. |
| `OFF_DAY_COLOR_LIGHT` | `string` | `'#e8d5f5'` — light purple for off-day cells in light mode. |

---

## Functions & Methods

### `getLevel(seconds)` (private)

**Signature:** `function getLevel(seconds: number): 0 | 1 | 2 | 3 | 4`

**Returns:** Activity level (0 = none, 1 = <10 min, 2 = <30 min, 3 = <60 min, 4 = ≥60 min).

---

### `GitHubHeatmap({ data, offDays, darkMode, firstDayOfWeek })` (default export)

**Signature:** `export default function GitHubHeatmap({ data?, offDays?, darkMode?, firstDayOfWeek? }): JSX.Element`

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `object` | `{}` | Map of `YYYY-MM-DD` → seconds (or `{ seconds }` object) for each day. |
| `offDays` | `object` | `{}` | Map of `YYYY-MM-DD` → truthy value for days marked as off-days. |
| `darkMode` | `boolean` | `true` | Selects dark or light colour palettes. |
| `firstDayOfWeek` | `'monday' \| 'sunday'` | `'monday'` | Controls row order and day label alignment. |

**Description:** Uses `useMemo` to recompute the full grid layout when `data`, `offDays`, or `firstDayOfWeek` change. The algorithm:
1. Determines today's position in the configured week layout using a `jsToRow` mapping array.
2. Calculates a start date ~53 weeks ago, adjusted back to the nearest configured first day.
3. Walks forward day by day, building `weeks` (array of week arrays, each cell `{ date, seconds, level }`) and `monthLabels` (position + name).
4. Off-days receive `level: -1` which maps to the off-day colour instead of the green scale.

Renders an SVG with month text labels, weekday text labels, and `<rect>` elements for each day cell. Below the SVG, renders a 5-cell colour legend ("Less ... More").

**Callers:** `DashboardPage.jsx`, `SocialPage.jsx`.

---

## Exports

| Export | Description |
|---|---|
| `default GitHubHeatmap` | Rendered on the dashboard and on friend profile cards in the social page. |

---

## Known Issues & Technical Debt

- Cell tooltips (showing the date and exact time on hover) are not implemented. The GitHub original shows a tooltip on hover.
- The component does not respond to `resize` events; `totalWidth` is computed once at render time from `weeks.length`. If the container is narrower than `totalWidth`, the SVG will overflow horizontally.
- The 53-week calculation may occasionally produce 52 or 54 columns depending on the day of the week and time of year.
