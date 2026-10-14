import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

// shortcut: IndexedDB only (web). Phase 4 native builds need an AsyncStorage/MMKV adapter here.
// Every call is wrapped: private windows and blocked storage must never crash the app.
export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await get<string>(name)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value);
    } catch {
      /* storage unavailable; state stays in memory */
    }
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      /* ignore */
    }
  },
};
