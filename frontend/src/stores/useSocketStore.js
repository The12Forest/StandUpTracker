import { create } from 'zustand';
import { io } from 'socket.io-client';
import { getToken } from '../lib/api';

const useSocketStore = create((set, get) => ({
  socket: null,
  connected: false,
  connectionCount: 0,

  connect: () => {
    const existing = get().socket;
    if (existing?.connected) return;

    const token = getToken();
    if (!token) return;

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('CONNECTION_COUNT', (data) => set({ connectionCount: data.count }));

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
