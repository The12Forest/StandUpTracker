import { create } from 'zustand';
import { api } from '../lib/api';
import { todayKey } from '../lib/utils';

const useTimerStore = create((set, get) => ({
  // Timer state
  running: false,
  startedAt: null,
  elapsed: 0,       // seconds for current session
  todayTotal: 0,    // seconds already tracked today
  ntpOffset: 0,     // ms offset from server clock

  // rAF handle
  _rafId: null,

  correctedNow: () => Date.now() + get().ntpOffset,

  start: () => {
    const state = get();
    if (state.running) return;
    const now = state.correctedNow();
    set({ running: true, startedAt: now, elapsed: 0 });
    get()._tick();

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(30);
  },

  stop: () => {
    const state = get();
    if (!state.running) return;
    cancelAnimationFrame(state._rafId);

    const sessionSeconds = Math.round((state.correctedNow() - state.startedAt) / 1000);
    const newTotal = state.todayTotal + sessionSeconds;

    set({
      running: false,
      startedAt: null,
      elapsed: 0,
      todayTotal: newTotal,
      _rafId: null,
    });

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate([20, 50, 20]);

    // Save to server
    get()._save(sessionSeconds);
    return sessionSeconds;
  },

  _tick: () => {
    const tick = () => {
      const state = get();
      if (!state.running) return;
      const now = state.correctedNow();
      const elapsed = Math.round((now - state.startedAt) / 1000);
      set({ elapsed, _rafId: requestAnimationFrame(tick) });
    };
    set({ _rafId: requestAnimationFrame(tick) });
  },

  _save: async (sessionSeconds) => {
    // Skip trivial sessions and cap insane values
    if (sessionSeconds < 1) return;
    const cappedSession = Math.min(sessionSeconds, 86400);
    const date = todayKey();
    const state = get();
    try {
      await api('/api/tracking', {
        method: 'POST',
        body: JSON.stringify({
          date,
          seconds: state.todayTotal,
          session: {
            start: new Date(state.correctedNow() - cappedSession * 1000).toISOString(),
            end: new Date(state.correctedNow()).toISOString(),
            duration: cappedSession,
          },
        }),
      });
    } catch (err) {
      console.error('Failed to save tracking:', err);
      // Queue for offline sync
      const queue = JSON.parse(localStorage.getItem('sut_sync_queue') || '[]');
      queue.push({ date, seconds: state.todayTotal, timestamp: Date.now() });
      localStorage.setItem('sut_sync_queue', JSON.stringify(queue));
    }
  },

  loadToday: async () => {
    try {
      const date = todayKey();
      const data = await api(`/api/tracking?from=${date}&to=${date}`);
      const todayData = data[date];
      if (todayData != null) {
        const seconds = typeof todayData === 'object' ? (todayData.seconds || 0) : (todayData || 0);
        set({ todayTotal: seconds });
      }
    } catch { /* ignore */ }
  },

  setNtpOffset: (offset) => set({ ntpOffset: offset }),

  // Sync from server state (WebSocket)
  syncFromServer: (serverState) => {
    const ntpOffset = get().ntpOffset;
    if (serverState.running && !get().running) {
      // Adjust startedAt with NTP offset for accurate local display
      const adjustedStart = serverState.startedAt ? serverState.startedAt - ntpOffset : get().correctedNow();
      set({ running: true, startedAt: adjustedStart });
      get()._tick();
    } else if (!serverState.running && get().running) {
      cancelAnimationFrame(get()._rafId);
      set({ running: false, startedAt: null, elapsed: 0, _rafId: null });
    }
  },
}));

export default useTimerStore;
