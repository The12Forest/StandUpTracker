import { create } from 'zustand';
import { api, setToken, clearToken } from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,
  // Impersonation (detected from server response)
  isImpersonating: false,

  init: async (retryCount = 0) => {
    // On page load, try to fetch current user using the httpOnly cookie.
    // If the cookie is valid, the server returns user + session token (for socket).
    try {
      const data = await api('/api/auth/me');
      if (data.token) setToken(data.token);
      // Detect impersonation from server response (impersonator field set when session is impersonation)
      const isImpersonating = !!data.user?.impersonator;
      set({ user: data.user, loading: false, isImpersonating });
    } catch (err) {
      // Only log the user out on genuine auth failures (401 / isAuthError).
      // Transient server errors (503, 500) or network failures should retry
      // before clearing state — this prevents spurious logouts on page reload
      // when MongoDB has a momentary hiccup.
      if (err.isAuthError) {
        clearToken();
        set({ user: null, loading: false });
        return;
      }
      // Transient error — retry up to 2 times with back-off
      if (retryCount < 2) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return get().init(retryCount + 1);
      }
      // Retries exhausted — log out
      clearToken();
      set({ user: null, loading: false });
    }
  },

  login: async (login, password, code2fa, type2fa) => {
    set({ error: null });
    const body = { login, password };
    if (code2fa && type2fa === 'totp') body.totpCode = code2fa;
    if (code2fa && type2fa === 'email') body.email2faCode = code2fa;
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.requires2fa) return data;
    if (data.needsVerification) return data;
    // Store session token in memory for socket auth
    setToken(data.token);
    set({ user: data.user });
    // Fetch full profile so all fields (stats, goal, enforcement) are populated after login
    await get().refreshUser();
    return data;
  },

  register: async (username, email, password, legacyData) => {
    set({ error: null });
    const body = { username, email, password };
    if (legacyData) body.legacyData = legacyData;
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.needsVerification) return data;
    setToken(data.token);
    set({ user: data.user });
    // Fetch the full profile to ensure all fields are present (e.g. enforcement settings)
    await get().refreshUser();
    return data;
  },

  logout: async () => {
    // Clear server-side session + cookie
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearToken();
    set({ user: null, isImpersonating: false });
  },

  updateProfile: async (updates) => {
    await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    await get().refreshUser();
  },

  changePassword: async (currentPassword, newPassword) => {
    return api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  refreshUser: async () => {
    try {
      const data = await api('/api/auth/me');
      if (data.token) setToken(data.token);
      set({ user: data.user });
    } catch { /* ignore */ }
  },

  // Impersonation — server manages session cookies (sut_session + impersonator_token)
  startImpersonation: async (userId) => {
    const data = await api(`/api/admin/impersonate/${userId}`, { method: 'POST' });
    // Server sets impersonator_token cookie (admin's session) and sut_session cookie (impersonation session)
    // Store the impersonation token in memory for socket auth
    setToken(data.token);
    set({ user: data.user, isImpersonating: true });
    // Fetch full profile for impersonated user (response only contains basic fields)
    await get().refreshUser();
  },

  endImpersonation: async () => {
    // Server restores admin's session cookie from impersonator_token and clears impersonator_token
    try {
      await api('/api/admin/impersonate/end', { method: 'POST' });
    } catch { /* ignore */ }

    set({ isImpersonating: false });
    // Refresh user — the server has restored the admin's session cookie
    await get().refreshUser();
  },
}));

export default useAuthStore;
