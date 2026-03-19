import { create } from 'zustand';
import { io } from 'socket.io-client';
import { getToken } from '../lib/api';
import useTimerStore from './useTimerStore';
import useNotificationStore from './useNotificationStore';
import useAuthStore from './useAuthStore';

const useSocketStore = create((set, get) => ({
  socket: null,
  connected: false,
  connectionCount: 0,

  connect: () => {
    const existing = get().socket;
    if (existing?.connected) return;
    // Clean up any stale disconnected socket before creating a new one
    if (existing) existing.disconnect();

    const token = getToken();
    if (!token) return;

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ connected: true });
      // Re-fetch timer state and today's total on connect/reconnect
      useTimerStore.getState().fetchState();
      useTimerStore.getState().loadToday();
      useNotificationStore.getState().fetchUnreadCount();
    });
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('CONNECTION_COUNT', (data) => set({ connectionCount: data.count }));

    // Personal timer sync (cross-device)
    socket.on('TIMER_SYNC', (data) => {
      useTimerStore.getState().syncFromServer(data);
    });

    // Real-time stats update (level, streak, total, todaySeconds)
    socket.on('STATS_UPDATE', (data) => {
      useTimerStore.getState().syncStats(data);
      // Update auth store user object with fresh stats
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: {
            ...currentUser,
            // recalcUserStats returns totalSeconds; some paths emit totalStandingSeconds
            totalStandingSeconds: data.totalStandingSeconds ?? data.totalSeconds ?? currentUser.totalStandingSeconds,
            totalDays: data.totalDays ?? currentUser.totalDays,
            currentStreak: data.currentStreak ?? currentUser.currentStreak,
            bestStreak: data.bestStreak ?? currentUser.bestStreak,
            level: data.level ?? currentUser.level,
          },
        });
      }
    });

    // Real-time notifications
    socket.on('NOTIFICATION', (notif) => {
      useNotificationStore.getState().addNotification(notif);
    });

    // Notification count on connect
    socket.on('NOTIFICATION_COUNT', (data) => {
      useNotificationStore.getState().setUnreadCount(data.count);
    });

    // Admin changed enforcement settings — refresh user profile
    socket.on('SETTINGS_CHANGED', () => {
      useAuthStore.getState().refreshUser();
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  emit: (event, data) => {
    const { socket } = get();
    if (socket?.connected) socket.emit(event, data);
  },

  on: (event, handler) => {
    const { socket } = get();
    if (socket) socket.on(event, handler);
  },

  off: (event, handler) => {
    const { socket } = get();
    if (socket) socket.off(event, handler);
  },
}));

export default useSocketStore;
