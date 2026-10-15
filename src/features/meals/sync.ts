import type { QueryClient } from '@tanstack/react-query';

import { toast } from '@/components/Toast';
import { ApiError, callFunction } from '@/lib/api';
import { t } from '@/lib/i18n';
import { flush, PermanentError, useOutbox, type OutboxOp } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';

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
  const { error } = await supabase.from('meals').delete().eq('id', op.mealId);
  if (error) throw error;
}

let started = false;

/** Replays the outbox on reconnect, on app start, when the app comes back to the foreground, and every 30 s. */
export function startSync(qc: QueryClient) {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = async () => {
    if (navigator.onLine === false || !useOutbox.getState().items.length) return;
    const r = await flush(sendOp);
    if (r.sent || r.dropped) {
      qc.invalidateQueries({ queryKey: ['meals'] });
      qc.invalidateQueries({ queryKey: ['usual'] });
    }
    if (r.sent) toast({ message: t('sync.done', { n: r.sent }), tone: 'success' });
    if (r.dropped) toast({ message: t('sync.dropped'), tone: 'error' });
  };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  setInterval(run, 30_000);
  void run();
}
