# frontend/src/stores/useAuthStore.js

## File Overview

**File path:** `frontend/src/stores/useAuthStore.js`

Zustand store that manages all authentication and user session state. Handles the full auth lifecycle: initial session restoration from the HttpOnly cookie, login (including 2FA flows), registration, logout, profile updates, and admin impersonation. The in-memory session token (used only for Socket.io auth) is kept in sync via `setToken`/`clearToken` from `api.js`. Impersonation state survives page reloads by persisting to `sessionStorage`.

**Dependencies (internal):**
- `../lib/api` (`api`, `setToken`, `clearToken`)

**Dependencies (external):**
- `zustand` (`create`)

**Side effects when loaded:** None (store is created but actions are not executed).

---

## State

| Field | Type | Initial | Description |
|---|---|---|---|
| `user` | `object \| null` | `null` | Current authenticated user object (full profile). |
| `loading` | `boolean` | `true` | True while `init()` is in progress; false once resolved. |
| `error` | `string \| null` | `null` | Last authentication error message. |
| `originalToken` | `string \| null` | `null` | Admin's JWT saved during impersonation so it can be restored. |
| `isImpersonating` | `boolean` | `false` | Whether the admin is currently viewing the app as another user. |

---

## Actions

### `init()`

**Signature:** `async init(): Promise<void>`

**Description:** Called once on app load. Calls `GET /api/auth/me`; if successful, stores the session token in memory and restores impersonation state from `sessionStorage` (`sut_isImpersonating`, `sut_originalToken`). Sets `loading: false` on completion. On failure, clears the token and sets `user: null`.

**Side effects:** Calls `setToken`; reads `sessionStorage`.

---

### `login(login, password, code2fa?, type2fa?)`

**Signature:** `async login(login: string, password: string, code2fa?: string, type2fa?: string): Promise<object>`

**Returns:** The raw API response (may include `requires2fa` or `needsVerification` flags for the caller to handle).

**Description:** Posts credentials to `POST /api/auth/login`. If 2FA is required, returns the response for the caller to prompt the user. On success, stores the session token and calls `refreshUser()` for a full profile fetch.

---

### `register(username, email, password, legacyData?)`

**Signature:** `async register(username: string, email: string, password: string, legacyData?: object): Promise<object>`

**Description:** Posts to `POST /api/auth/register`, optionally including legacy migration data. Returns the response; on success (no email verification needed), stores the token and calls `refreshUser()`.

---

### `logout()`

**Signature:** `async logout(): Promise<void>`

**Description:** Calls `POST /api/auth/logout` (best-effort), clears the in-memory token, removes impersonation state from `sessionStorage`, and resets `user`, `originalToken`, and `isImpersonating`.

---

### `updateProfile(updates)`

**Signature:** `async updateProfile(updates: object): Promise<void>`

**Description:** PUTs to `/api/auth/profile`, then calls `refreshUser()`.

---

### `changePassword(currentPassword, newPassword)`

**Signature:** `async changePassword(currentPassword: string, newPassword: string): Promise<object>`

**Returns:** The API response directly (not stored in state).

**Description:** PUTs to `/api/auth/password`.

---

### `refreshUser()`

**Signature:** `async refreshUser(): Promise<void>`

**Description:** Calls `GET /api/auth/me` and updates `user` and the in-memory token. Errors are silently swallowed. Called after any profile mutation to ensure the store reflects server state.

---

### `startImpersonation(userId)`

**Signature:** `async startImpersonation(userId: string): Promise<void>`

**Description:** Calls `POST /api/admin/impersonate/:userId`. Saves the admin's current in-memory token to `sessionStorage` (`sut_originalToken`), sets the impersonation token as the active token, updates `user` to the impersonated user, and calls `refreshUser()`.

**Side effects:** Writes `sessionStorage.sut_originalToken` and `sessionStorage.sut_isImpersonating`.

---

### `endImpersonation()`

**Signature:** `async endImpersonation(): Promise<void>`

**Description:** Calls `POST /api/admin/impersonate/end` (best-effort), clears `sessionStorage` impersonation keys. If an original token exists, restores it and refreshes the user profile. If no original token is found, falls back to logout.

---

## Exports

```js
export default useAuthStore;
```

---

## Known Issues & Technical Debt

- `logout()` ignores errors from the server-side logout call (`catch { /* ignore */ }`), which could leave orphaned server-side sessions if the call fails.
- Impersonation token is saved to `sessionStorage` as plaintext; this is a trade-off for persistence across page reloads. A more secure design would re-authenticate instead of saving the raw token.
- `login()` clears `error: null` at the top but never sets `error` on failure; the caller must handle the thrown exception independently.
