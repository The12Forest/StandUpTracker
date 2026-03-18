const TOKEN_KEY = 'sut_token';

export async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('sut_originalToken');
    localStorage.removeItem('sut_isImpersonating');
    window.location.href = '/login';
    throw new Error('Session expired');
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

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
