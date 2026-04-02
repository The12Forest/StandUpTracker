# frontend/src/components/AppLayout.jsx

## File Overview

**File path:** `frontend/src/components/AppLayout.jsx`

React Router layout component that wraps all authenticated pages. Renders the `<Sidebar>`, a top notification bar with `<NotificationBell>`, an impersonation warning banner (when an admin is viewing the app as another user), and the `<Outlet>` where the current route's page component is rendered. Redirects to `/login` if the user is not authenticated.

**Dependencies (internal):**
- `../stores/useAuthStore`
- `./Sidebar`
- `./NotificationBell`

**Dependencies (external):**
- `react-router-dom` (`Outlet`, `Navigate`)

**Side effects when mounted:** None beyond DOM rendering.

---

## Functions & Methods

### `AppLayout()` (default export)

**Signature:** `export default function AppLayout(): JSX.Element`

**Description:** Reads `user`, `loading`, `isImpersonating`, and `endImpersonation` from `useAuthStore`. During loading, renders a centered spinner. If the user is absent after loading, redirects to `/login`. Otherwise renders:

1. `<Sidebar>` — fixed left navigation.
2. Main content area (flex-1):
   - **Impersonation banner** (visible only when `isImpersonating`): yellow warning strip showing the impersonated username and an "End Impersonation" button that calls `endImpersonation()`.
   - **Top bar**: right-aligned `<NotificationBell>`.
   - **`<main>`**: padding wrapper containing `<Outlet>` for the active route.

**Callers:** Used as a layout route wrapper in `App.jsx` for all authenticated routes.

---

## Exports

| Export | Description |
|---|---|
| `default AppLayout` | Used as the `element` of the parent `<Route>` in `App.jsx`. |

---

## Known Issues & Technical Debt

- The top bar's `<NotificationBell>` is always visible and always in the top-right corner. On mobile, the `<Sidebar>` toggle overlaps the top-left corner; this leaves the top-right available, but the layout has no explicit mobile header bar, which may feel inconsistent.
