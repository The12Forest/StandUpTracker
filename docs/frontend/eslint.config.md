# frontend/eslint.config.js

## File Overview

**File path:** `frontend/eslint.config.js`

ESLint flat configuration for the React frontend. Uses the new flat config API (`defineConfig`, `globalIgnores`) introduced in ESLint 9. Applies the recommended JS ruleset, React Hooks rules, and React Refresh rules to all `.js` and `.jsx` files, while ignoring the `dist/` build output directory.

**Dependencies (external):**
- `@eslint/js`
- `globals`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `eslint/config` (`defineConfig`, `globalIgnores`)

**Side effects when loaded:** None (evaluated by ESLint at startup).

---

## Configuration

### Ignored Paths

| Pattern | Reason |
|---|---|
| `dist` | Generated build output; should not be linted. |

### Applied Rule Sets

| Ruleset | Source | Description |
|---|---|---|
| `js.configs.recommended` | `@eslint/js` | Standard JS best-practice rules (no-unused-vars, no-undef, etc.). |
| `reactHooks.configs.flat.recommended` | `eslint-plugin-react-hooks` | Enforces rules of hooks (call order, dependency arrays). |
| `reactRefresh.configs.vite` | `eslint-plugin-react-refresh` | Ensures only React components are exported from module files so React Fast Refresh works correctly. |

### Language Options

| Option | Value | Description |
|---|---|---|
| `ecmaVersion` | `2020` | Minimum ECMAScript version for parsing. |
| `globals` | `globals.browser` | Injects browser global variables (`window`, `document`, etc.) so ESLint does not flag them as undefined. |
| `parserOptions.ecmaVersion` | `'latest'` | Uses the latest ECMAScript syntax for parsing. |
| `parserOptions.ecmaFeatures.jsx` | `true` | Enables JSX syntax. |
| `parserOptions.sourceType` | `'module'` | Files are ES modules. |

### Custom Rules

| Rule | Setting | Reason |
|---|---|---|
| `no-unused-vars` | `['error', { varsIgnorePattern: '^[A-Z_]' }]` | Allows unused variables whose names start with an uppercase letter or underscore (common for imported constants and intentionally ignored destructure targets). |
| `react-hooks/set-state-in-effect` | `'off'` | Disabled because it produces false positives for valid async-function-calling patterns inside `useEffect`. |
| `react-hooks/purity` | `'off'` | Disabled for the same reason as above — triggers false positives. |

---

## Known Issues & Technical Debt

- Disabling `react-hooks/set-state-in-effect` and `react-hooks/purity` hides potential hook-safety issues. These were disabled as a workaround for plugin v7 false positives; consider re-evaluating once the plugin stabilises.
