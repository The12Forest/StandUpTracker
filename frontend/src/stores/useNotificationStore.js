import { create } from 'zustand';
import { api } from '../lib/api';

const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  open: false,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),

  fetch: async () => {
    try {
      const data = await api('/api/notifications');
      set({ notifications: data.notifications || [], unreadCount: data.unreadCount || 0 });
    } catch { /* ignore */ }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await api('/api/notifications/unread-count');
      set({ unreadCount: data.count || 0 });
    } catch { /* ignore */ }
  },

  markRead: async (id) => {
    try {
      await api(`/api/notifications/${id}/read`, { method: 'PUT' });
      set((s) => {
        const target = s.notifications.find((n) => n._id === id);
        const wasUnread = target && !target.read;
        return {
          notifications: s.notifications.map((n) =>
            n._id === id ? { ...n, read: true } : n
          ),
          unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
        };
      });
    } catch { /* ignore */ }
  },

  markAllRead: async () => {
    try {
      await api('/api/notifications/read-all', { method: 'PUT' });
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch { /* ignore */ }
  },

  // Called from socket listener
  addNotification: (notif) => {
    set((s) => ({
      notifications: [notif, ...s.notifications].slice(0, 50),
      unreadCount: s.unreadCount + 1,
    }));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),
}));

export default useNotificationStore;
