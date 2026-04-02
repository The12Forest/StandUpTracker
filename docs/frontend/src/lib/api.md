# frontend/src/lib/api.js

## File Overview

**File path:** `frontend/src/lib/api.js`

Central HTTP client for all API requests from the frontend. Authentication relies on the HttpOnly `sut_session` cookie (sent automatically via `credentials: 'include'`). An in-memory session token (`_sessionToken`) is maintained separately for use by the Socket.io client, which cannot access HttpOnly cookies. On a 401 response, the client clears the session token and redirects to `/login` (with `?expired=true` if the server flagged session expiry), unless the request is from a public page or is the initial `/api/auth/me` check.

**Dependencies (internal):** None.

**Dependencies (external):** `fetch` (browser built-in).

**Side effects when loaded:** Declares `_sessionToken = null`.

---

## Variables & Constants

| Variable | Type | Description |
|---|---|---|
| `_sessionToken` | `string \| null` | In-memory storage for the current JWT. Used only for Socket.io auth. Not persisted to `localStorage`. Cleared on 401. |

---

## Functions & Methods

### `api(path, options?)`

**Signature:** `async function api(path: string, options?: RequestInit): Promise<any>`

**Returns:** The parsed JSON response body on success.

**Throws:** An `Error` with `.status` (HTTP status code) and `.data` (parsed response body) on non-2xx responses. On 401, also performs a redirect side-effect before throwing.

**Description:**
1. Merges `Content-Type: application/json` into the request headers.
2. Calls `fetch` with `credentials: 'include'` to send the HttpOnly cookie.
3. On 401: clears `_sessionToken`, checks whether the current page is public (`/login`, `/register`, `/setup`) or whether the path is `/api/auth/me`. If neither condition is true, redirects to `/login` or `/login?expired=true`. Always throws.
4. On non-2xx: attaches `.status` and `.data` to the thrown Error for callers that need to inspect the status code (e.g. 429 cooldown handling in `DashboardPage`).
5. On success: returns the parsed JSON body.

**Side effects:** May redirect the entire page to `/login`.

**Callers:** Used everywhere in the frontend — all stores, hooks, and page components.

---

### `setToken(token)`

**Signature:** `export function setToken(token: string): void`

**Description:** Stores the session token in the module-level `_sessionToken` variable. Called by `useAuthStore` after a successful login, registration, or `/api/auth/me` response.

**Callers:** `useAuthStore.js`.

---

### `getToken()`

**Signature:** `export function getToken(): string | null`

**Description:** Returns the current in-memory session token. Called by `useSocketStore` to provide the token in the Socket.io `auth` handshake.

**Callers:** `useSocketStore.js`, `useAuthStore.js` (to save the original token during impersonation).

---

### `clearToken()`

**Signature:** `export function clearToken(): void`

**Description:** Sets `_sessionToken` to `null`. Called on logout and on 401 responses.

**Callers:** `useAuthStore.js` (logout, init failure), `api()` (401 handler).

---

## Exports

```js
export { api, setToken, getToken, clearToken };
```

---

## Known Issues & Technical Debt

- The 401 redirect is a side-effect inside a utility function, which makes it hard to test and can cause unexpected behaviour if an API call fails in an unexpected context (e.g. a background interval). A better pattern would be to emit an event or set a global store flag.
- `_sessionToken` is module-level state in an ES module singleton; multiple tab instances share the same module but each has its own memory, so there is no cross-tab token sharing (which is intentional for security).
