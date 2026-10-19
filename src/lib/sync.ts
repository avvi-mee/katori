import type { QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/Toast';
import { ApiError, callFunction } from '@/lib/api';
import { t } from '@/lib/i18n';
import { flush, PermanentError, PRIMARY_KEY, useOutbox, type OutboxOp, type SyncTable } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';

// Bad data (22xxx), constraint (23xxx) and permission/RLS/schema (42xxx) errors never fix themselves;
// network, auth refresh (PGRST3xx) and 5xx do.
const permanent = (code: string | undefined) => !!code && /^(22|23|42|PGRST[12])/.test(code);

/** Sends one queued op. Requests that can never succeed are dropped; everything else is retried. */
export async function sendOp(op: OutboxOp): Promise<void> {
  if (op.kind === 'confirm-meal') {
    try {
      await callFunction('confirm-meal', op.body);
    } catch (e) {
      // An expired scan draft or a malformed body won't fix itself; auth/network/5xx will.
      if (e instanceof ApiError && (e.code === 'BAD_REQUEST' || e.code === 'NOT_FOUND'))
        throw new PermanentError(e.message);
      throw e;
    }
    return;
  }
  const { error } =
    op.kind === 'delete-meal'
      ? await supabase.from('meals').delete().eq('id', op.mealId)
      : op.kind === 'upsert'
        ? await supabase.from(op.table).upsert(op.rows, { onConflict: PRIMARY_KEY[op.table].join(',') })
        : await supabase.from(op.table).delete().match(op.match);
  if (error) throw permanent(error.code) ? new PermanentError(error.message) : error;
}

const SYNCED_KEYS = ['meals', 'usual', 'personal_records', ...(Object.keys(PRIMARY_KEY) as SyncTable[])];

let run: (() => Promise<void>) | null = null;

/** Try the outbox now (after a local write). No-op before startSync or while offline. */
export const syncNow = () => void run?.();

/** Replays the outbox on reconnect, on app start, when the app comes back to the foreground, and every 30 s. */
export function startSync(qc: QueryClient) {
  if (run || typeof window === 'undefined') return;
  run = async () => {
    if (navigator.onLine === false || !useOutbox.getState().items.length) return;
    // Tracker writes always pass through the outbox; only ops that sat there (offline) earn a "Synced" toast.
    const waited = useOutbox.getState().items.filter((i) => Date.now() - i.created_at > 5_000).length;
    const r = await flush(sendOp);
    if (r.sent || r.dropped) for (const key of SYNCED_KEYS) void qc.invalidateQueries({ queryKey: [key] });
    if (r.sent && waited) toast({ message: t('sync.done', { n: Math.min(r.sent, waited) }), tone: 'success' });
    if (r.dropped) toast({ message: t('sync.dropped'), tone: 'error' });
  };
  window.addEventListener('online', () => void run?.());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void run?.());
  setInterval(() => void run?.(), 30_000);
  void run();
}
