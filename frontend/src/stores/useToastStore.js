import { create } from 'zustand';

const useToastStore = create((set, get) => ({
  toasts: [],

  add: (message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    if (duration > 0) {
      setTimeout(() => get().remove(id), duration);
    }
    return id;
  },

  success: (msg) => get().add(msg, 'success'),
  error: (msg) => get().add(msg, 'error', 6000),
  warn: (msg) => get().add(msg, 'warn'),
  info: (msg) => get().add(msg, 'info'),

  remove: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export default useToastStore;
