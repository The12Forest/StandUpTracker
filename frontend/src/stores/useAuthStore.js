import { create } from 'zustand';
import { api, setToken, clearToken, getToken } from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,
  // Impersonation
  originalToken: null,
  isImpersonating: false,

  init: async () => {
    const token = getToken();
    if (!token) { set({ loading: false }); return; }
    // Restore impersonation state from localStorage
    const isImpersonating = localStorage.getItem('sut_isImpersonating') === 'true';
    const originalToken = localStorage.getItem('sut_originalToken') || null;
    try {
      const data = await api('/api/auth/me');
      set({ user: data.user, loading: false, isImpersonating, originalToken });
    } catch {
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
    setToken(data.token);
    set({ user: data.user });
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
    // Clear server-side HttpOnly cookie
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearToken();
    localStorage.removeItem('sut_originalToken');
    localStorage.removeItem('sut_isImpersonating');
    set({ user: null, originalToken: null, isImpersonating: false });
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
      set({ user: data.user });
    } catch { /* ignore */ }
  },

  // Impersonation
  startImpersonation: async (userId) => {
    const currentToken = getToken();
    const data = await api(`/api/admin/impersonate/${userId}`, { method: 'POST' });
    localStorage.setItem('sut_originalToken', currentToken);
    localStorage.setItem('sut_isImpersonating', 'true');
    setToken(data.token);
    set({ user: data.user, originalToken: currentToken, isImpersonating: true });
  },

  endImpersonation: async () => {
    const orig = get().originalToken || localStorage.getItem('sut_originalToken');

    // Best-effort server-side cleanup using raw fetch to avoid 401 redirect
    try {
      const shadowToken = getToken();
      await fetch('/api/admin/impersonate/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shadowToken}` },
        credentials: 'include',
      });
    } catch { /* ignore */ }

    // Always restore admin session
    localStorage.removeItem('sut_originalToken');
    localStorage.removeItem('sut_isImpersonating');

    if (orig) {
      setToken(orig);
      set({ originalToken: null, isImpersonating: false });
      await get().refreshUser();
    } else {
      // No original token — fall back to logout
      clearToken();
      set({ user: null, originalToken: null, isImpersonating: false });
    }
  },
}));

export default useAuthStore;
