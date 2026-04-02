# public/js/features.js

## File Overview

**File path:** `public/js/features.js`

Legacy vanilla-JS gamification module wrapped in a revealing module pattern (`const Features = (function() { ... })()`). Implements two systems: an **achievements system** (16 named achievements with German titles, e.g. "Erster Schritt", "Legende") and a **level system** (XP thresholds and titles). Achievement checks are function-based predicates operating on a `stats` object.

**Dependencies:** None (self-contained module, no imports).

**Side effects when loaded:** Creates a global `Features` object.

---

## Variables & Constants

### `ACHIEVEMENTS`

Array of 16 achievement definitions. Each object: `{ id, name, desc, icon, check }`.

| Achievement ID | Trigger |
|---|---|
| `first_stand` | `totalDays >= 1` |
| `streak_3` through `streak_100` | Streak milestones |
| `hours_1` through `hours_500` | Total standing hour milestones |
| `goal_hit_5` through `goal_hit_50` | Goal-met day counts |
| `early_bird` | Start before 08:00 |
| `night_owl` | Stand after 20:00 |
| `double_goal` | 2× daily goal in one day |

---

## Known Issues & Technical Debt

- `[CANDIDATE FOR REMOVAL]` Legacy module superseded by the React SPA's server-side streak/level system and the `levelFromSeconds` utility in `frontend/src/lib/utils.js`.
- Achievement titles and descriptions are in German (`"Erster Schritt"`, `"Auf dem Weg"`, etc.) while the rest of the application UI is in English. This suggests the file is an early prototype that was never localised.
- Achievement checks (`check: (stats) => ...`) duplicate streak and level logic that is now maintained server-side.
- The level system inside this file duplicates the threshold logic in `frontend/src/lib/utils.js` and `server/utils/recalcStats.js`. `[DUPLICATE OF: frontend/src/lib/utils.js, server/utils/recalcStats.js]`
