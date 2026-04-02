# frontend/src/stores/useToastStore.js

## File Overview

**File path:** `frontend/src/stores/useToastStore.js`

Minimal Zustand store for managing the global toast notification queue. Toasts are auto-dismissed after a configurable duration (default 4 seconds for info/success/warn, 6 seconds for errors). The store is consumed by `ToastContainer` (renders all active toasts) and called directly from any component or store that needs to display a message.

**Dependencies (internal):** None.

**Dependencies (external):**
- `zustand` (`create`)

**Side effects when loaded:** None.

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `toasts` | `Array<{ id: number, message: string, type: string }>` | `[]` | Active toast items. Each has a unique float `id` (timestamp + random), a message string, and a type (`'success'`, `'error'`, `'warn'`, `'info'`). |

---

## Actions

### `add(message, type?, duration?)`

**Signature:** `add(message: string, type?: string = 'info', duration?: number = 4000): number`

**Returns:** The `id` of the new toast.

**Description:** Creates a new toast object with a unique `id` (`Date.now() + Math.random()`), appends it to `toasts`, and schedules `remove(id)` after `duration` ms. If `duration` is 0 or negative, the toast persists until manually removed.

---

### `success(msg)`

**Signature:** `success(msg: string): number`

**Description:** Shorthand for `add(msg, 'success')`. Default duration 4000 ms.

---

### `error(msg)`

**Signature:** `error(msg: string): number`

**Description:** Shorthand for `add(msg, 'error', 6000)`. Extended duration of 6 seconds for errors.

---

### `warn(msg)`

**Signature:** `warn(msg: string): number`

**Description:** Shorthand for `add(msg, 'warn')`. Default duration 4000 ms.

---

### `info(msg)`

**Signature:** `info(msg: string): number`

**Description:** Shorthand for `add(msg, 'info')`. Default duration 4000 ms.

---

### `remove(id)`

**Signature:** `remove(id: number): void`

**Description:** Filters the toast with the given `id` out of `toasts`. Called automatically by the `setTimeout` in `add()` and by the manual close button in `ToastContainer`.

---

## Exports

```js
export default useToastStore;
```

---

## Known Issues & Technical Debt

- The `id` is generated as `Date.now() + Math.random()`, which is a float. Array filter with `===` comparison still works, but a UUID or integer counter would be cleaner and more predictable.
- There is no maximum queue size; if many errors occur in rapid succession the toast list can grow unbounded.
