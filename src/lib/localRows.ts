// Local-first tables (workouts, habits, activity, body, goals): every write goes to the outbox and into the
// query cache at once, and every read overlays whatever is still queued, so the UI is the same online,
// offline and mid-sync. Rows carry device-generated keys (crypto.randomUUID), so replays are idempotent.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/features/auth/session';
import { applyOp, enqueue, overlay, useOutbox, type SyncTable, type TableOp } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import { syncNow } from '@/lib/sync';

export type Row = Record<string, unknown>;

/** Writes locally first (cache + outbox), then tries to sync. Resolves once the write is durable on the device. */
export async function writeTable(qc: QueryClient, op: TableOp) {
  // `pending` is a UI flag from overlay(); it isn't a column. Upserts must carry every NOT NULL column.
  if (op.kind === 'upsert') op = { ...op, rows: op.rows.map(({ pending: _, ...r }) => r) };
  qc.setQueriesData<Row[]>({ queryKey: [op.table] }, (old) => (Array.isArray(old) ? applyOp(old, op) : old));
  await enqueue(op);
  syncNow();
}

export const upsertRows = (qc: QueryClient, table: SyncTable, rows: Row[]) =>
  writeTable(qc, { kind: 'upsert', table, rows });
export const deleteRows = (qc: QueryClient, table: SyncTable, match: Record<string, string>) =>
  writeTable(qc, { kind: 'delete', table, match });

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type Built = { range(from: number, to: number): Page };
const PAGE = 1000; // PostgREST max_rows default

async function fetchAll(q: Built): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as Row[]));
    if ((data as Row[]).length < PAGE || out.length >= 50 * PAGE) return out;
  }
}

/**
 * One cached query per table (the user's recent rows), overlaid with queued writes. `build` narrows the
 * select; `normalize` turns PostgREST numeric strings into numbers.
 */
export function useTable<T extends Row>(
  table: SyncTable,
  build: (q: ReturnType<typeof supabase.from>) => Built,
  normalize: (r: Row) => T = (r) => r as T,
  staleTime = 60_000,
) {
  const uid = useSession((s) => s.session?.user.id);
  const outbox = useOutbox((s) => s.items);
  const query = useQuery({
    queryKey: [table, uid],
    enabled: !!uid,
    staleTime,
    queryFn: async () => (await fetchAll(build(supabase.from(table)))).map(normalize),
  });
  const data = useMemo(
    () => (query.data || outbox.length ? overlay(table, (query.data ?? []) as T[], outbox) : undefined),
    [query.data, outbox, table],
  );
  return { data, isLoading: query.isLoading && !data, error: query.error, refetch: query.refetch };
}

export const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
