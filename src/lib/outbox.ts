// Offline outbox: writes that couldn't reach the server wait in IndexedDB and are replayed in order.
// Every op is idempotent server-side (meals carry a client_id), so replaying after a lost response is safe.
import { clear, createStore, del, entries, set, type UseStore } from 'idb-keyval';
import { create } from 'zustand';

import type { ComputedItem, Totals } from '@/features/portions/engine';
import type { MealSource, MealType } from '@/types/meal';

/** What the app shows for a queued meal until the server confirms it. */
export type PendingMeal = {
  client_id: string;
  eaten_at: string;
  meal_type: MealType;
  source: MealSource;
  items: ComputedItem[];
  totals: Totals;
};

export type OutboxOp =
  | { kind: 'confirm-meal'; body: Record<string, unknown>; pending: PendingMeal | null }
  | { kind: 'delete-meal'; mealId: string };

export type OutboxItem = { id: string; op: OutboxOp; created_at: number; attempts: number; next_at: number };

/** Throw from a sender when retrying can never succeed (the op is dropped). */
export class PermanentError extends Error {}

export type Sender = (op: OutboxOp) => Promise<void>;

const MAX_BACKOFF_MS = 10 * 60_000;
export const backoff = (attempts: number) => Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.max(0, attempts - 1));

let store: UseStore | null = null;
const db = () => (store ??= createStore('katori-outbox', 'ops'));

/** Live view of the queue for the UI. */
export const useOutbox = create<{ items: OutboxItem[] }>(() => ({ items: [] }));

export async function listOutbox(): Promise<OutboxItem[]> {
  const all = (await entries<string, OutboxItem>(db())).map(([, v]) => v);
  return all.sort((a, b) => a.created_at - b.created_at);
}

async function refresh() {
  useOutbox.setState({ items: await listOutbox() });
}

/** Load the queue into the UI store at app start. */
export const loadOutbox = () => refresh().catch(() => undefined);

export async function enqueue(op: OutboxOp, now = Date.now()): Promise<OutboxItem> {
  const item: OutboxItem = { id: crypto.randomUUID(), op, created_at: now, attempts: 0, next_at: now };
  await set(item.id, item, db());
  await refresh();
  return item;
}

export async function removeFromOutbox(id: string) {
  await del(id, db());
  await refresh();
}

export async function clearOutbox() {
  await clear(db());
  await refresh();
}

let flushing: Promise<{ sent: number; dropped: number; remaining: number }> | null = null;

/**
 * Replays due ops oldest-first. A transient failure (offline, 5xx) reschedules that op with backoff and
 * stops the run so we don't hammer a dead network; a PermanentError drops the op.
 */
export function flush(send: Sender, now = Date.now()) {
  flushing ??= (async () => {
    let sent = 0;
    let dropped = 0;
    try {
      for (const item of await listOutbox()) {
        if (item.next_at > now) continue;
        try {
          await send(item.op);
          await del(item.id, db());
          sent++;
        } catch (e) {
          if (e instanceof PermanentError) {
            await del(item.id, db());
            dropped++;
            continue;
          }
          const attempts = item.attempts + 1;
          await set(item.id, { ...item, attempts, next_at: now + backoff(attempts) }, db());
          break;
        }
      }
    } finally {
      await refresh();
      flushing = null;
    }
    return { sent, dropped, remaining: useOutbox.getState().items.length };
  })();
  return flushing;
}
