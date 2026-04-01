/**
 * API client — all authentication is handled via httpOnly cookie (sut_session).
 * The session token is also stored in memory for socket.io auth only.
 */

let _sessionToken = null;

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  if (res.status === 401) {
    _sessionToken = null;
    const data = await res.json().catch(() => ({}));
    // Don't redirect if already on login/register/setup pages or if this is the /me check
    const onPublicPage = ['/login', '/register', '/setup'].some(p => window.location.pathname.startsWith(p));
    const isAuthCheck = path === '/api/auth/me';
    if (!onPublicPage && !isAuthCheck) {
      const params = data.sessionExpired ? '?expired=true' : '';
      window.location.href = `/login${params}`;
    }
    throw new Error(data.error || 'Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Store session token in memory (for socket auth). NOT persisted to localStorage. */
export function setToken(token) {
  _sessionToken = token;
}

/** Get session token from memory (for socket auth only). */
export function getToken() {
  return _sessionToken;
}

/** Clear in-memory session token. */
export function clearToken() {
  _sessionToken = null;
}
