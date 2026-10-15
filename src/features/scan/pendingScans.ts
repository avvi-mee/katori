// "Save photo, analyse later": scans need the network, so photos taken offline wait here (IndexedDB)
// with the time they were taken, and are analysed once the phone is back online.
import { clear, createStore, del, entries, set, type UseStore } from 'idb-keyval';
import { create } from 'zustand';

import type { MealType } from '@/types/meal';

export type PendingScan = { id: string; blob: Blob; mealType: MealType; hint: string; takenAt: string };

let store: UseStore | null = null;
const db = () => (store ??= createStore('katori-scans', 'photos'));

export const usePendingScans = create<{ scans: PendingScan[] }>(() => ({ scans: [] }));

export async function loadPendingScans() {
  try {
    const all = (await entries<string, PendingScan>(db())).map(([, v]) => v);
    usePendingScans.setState({ scans: all.sort((a, b) => a.takenAt.localeCompare(b.takenAt)) });
  } catch {
    /* storage unavailable */
  }
}

export async function savePendingScan(scan: Omit<PendingScan, 'id'>) {
  const id = crypto.randomUUID();
  await set(id, { ...scan, id }, db());
  await loadPendingScans();
}

export async function removePendingScan(id: string) {
  await del(id, db());
  await loadPendingScans();
}

export async function clearPendingScans() {
  await clear(db());
  await loadPendingScans();
}
