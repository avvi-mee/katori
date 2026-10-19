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

/** Owner-writable tables whose rows carry device-generated keys, so replays upsert safely. */
export type SyncTable =
  | 'workouts'
  | 'workout_sets'
  | 'exercises'
  | 'workout_templates'
  | 'template_exercises'
  | 'activity_days'
  | 'runs'
  | 'habits'
  | 'habit_logs'
  | 'goals'
  | 'body_logs'
  | 'weights';

export type OutboxOp =
  | { kind: 'confirm-meal'; body: Record<string, unknown>; pending: PendingMeal | null }
  | { kind: 'delete-meal'; mealId: string }
  | { kind: 'upsert'; table: SyncTable; rows: Record<string, unknown>[] }
  | { kind: 'delete'; table: SyncTable; match: Record<string, string> };

/** Primary keys of the synced tables: upserts conflict on these, local overlays merge on them. */
export const PRIMARY_KEY: Record<SyncTable, string[]> = {
  workouts: ['id'],
  workout_sets: ['id'],
  exercises: ['id'],
  workout_templates: ['id'],
  template_exercises: ['template_id', 'position'],
  activity_days: ['user_id', 'date'],
  runs: ['id'],
  habits: ['id'],
  habit_logs: ['id'],
  goals: ['user_id'],
  body_logs: ['id'],
  weights: ['user_id', 'date'],
};

type Row = Record<string, unknown>;
export type TableOp = Extract<OutboxOp, { kind: 'upsert' | 'delete' }>;
const keyOf = (table: SyncTable, r: Row) => PRIMARY_KEY[table].map((c) => String(r[c])).join('|');

/** Applies one upsert/delete to a list of rows (upserts merge into an existing row with the same key). */
export function applyOp<T extends Row>(rows: T[], op: TableOp, mark = false): T[] {
  if (op.kind === 'delete') return rows.filter((r) => !Object.entries(op.match).every(([k, v]) => String(r[k]) === v));
  const out = [...rows];
  for (const row of op.rows) {
    const k = keyOf(op.table, row);
    const at = out.findIndex((r) => keyOf(op.table, r) === k);
    const next = { ...(at >= 0 ? out[at] : {}), ...row, ...(mark ? { pending: true } : {}) } as T;
    if (at >= 0) out[at] = next;
    else out.push(next);
  }
  return out;
}

/** Server rows plus the queued writes for this table, in queue order. */
export function overlay<T extends Row>(table: SyncTable, rows: T[], outbox: OutboxItem[]): T[] {
  let out = rows;
  for (const { op } of outbox)
    if ((op.kind === 'upsert' || op.kind === 'delete') && op.table === table) out = applyOp(out, op, true);
  return out;
}

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
