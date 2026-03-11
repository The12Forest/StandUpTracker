import { create } from 'zustand';
import { api } from '../lib/api';
import { todayKey } from '../lib/utils';

const useTimerStore = create((set, get) => ({
  // Timer state (server-authoritative)
  running: false,
  startedAt: null,  // server timestamp (ms) when timer started
  elapsed: 0,       // display-only seconds for current session
  todayTotal: 0,    // seconds already tracked today
  ntpOffset: 0,     // ms offset from server clock

  // rAF handle
  _rafId: null,

  correctedNow: () => Date.now() + get().ntpOffset,

  // Start timer via server
  start: async () => {
    const state = get();
    if (state.running) return;
    try {
      const data = await api('/api/timer/start', { method: 'POST' });
      // Server confirmed start — apply immediately
      const adjustedStart = data.startedAt - state.ntpOffset;
      set({ running: true, startedAt: adjustedStart, elapsed: 0 });
      get()._tick();
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      console.error('Timer start failed:', err);
    }
  },

  // Stop timer via server
  stop: async () => {
    const state = get();
    if (!state.running) return;
    cancelAnimationFrame(state._rafId);
    try {
      const data = await api('/api/timer/stop', { method: 'POST' });
      const sessionSeconds = data.sessionSeconds || 0;
      set({
        running: false,
        startedAt: null,
        elapsed: 0,
        todayTotal: get().todayTotal + sessionSeconds,
        _rafId: null,
      });
      if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
      return sessionSeconds;
    } catch (err) {
      console.error('Timer stop failed:', err);
      // Re-fetch state in case of error
      get().fetchState();
    }
  },

  _tick: () => {
    const tick = () => {
      const state = get();
      if (!state.running) return;
      const now = state.correctedNow();
      const elapsed = Math.max(0, Math.round((now - state.startedAt) / 1000));
      set({ elapsed, _rafId: requestAnimationFrame(tick) });
    };
    set({ _rafId: requestAnimationFrame(tick) });
  },

  // Fetch server timer state (used on connect / reconnect)
  fetchState: async () => {
    try {
      const data = await api('/api/timer/state');
      const state = get();
      if (data.running && !state.running) {
        const adjustedStart = data.startedAt - state.ntpOffset;
        set({ running: true, startedAt: adjustedStart });
        get()._tick();
      } else if (!data.running && state.running) {
        cancelAnimationFrame(state._rafId);
        set({ running: false, startedAt: null, elapsed: 0, _rafId: null });
      }
    } catch { /* ignore */ }
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

  // Sync from server state (WebSocket TIMER_SYNC)
  syncFromServer: (serverState) => {
    const ntpOffset = get().ntpOffset;
    if (serverState.running && !get().running) {
      const adjustedStart = serverState.startedAt ? serverState.startedAt - ntpOffset : get().correctedNow();
      set({ running: true, startedAt: adjustedStart });
      get()._tick();
    } else if (!serverState.running && get().running) {
      cancelAnimationFrame(get()._rafId);
      set({ running: false, startedAt: null, elapsed: 0, _rafId: null });
    }
  },

  // Sync stats from STATS_UPDATE event
  syncStats: (stats) => {
    if (stats.todaySeconds != null) {
      set({ todayTotal: stats.todaySeconds });
    }
  },
}));

export default useTimerStore;
