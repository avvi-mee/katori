// Trainer billing (docs/ARCHITECTURE.md "Trainer billing"): on the 1st of each month (IST) count each coach's
// active clients, record coach_billing (₹99 × clients) and sync the trainer subscription's quantity.
import { istDay } from './gen/lib/day.ts';
import { updateQuantity } from './billing.ts';
import type { Admin } from './http.ts';

export const PRICE_PER_CLIENT = 99;

export async function monthlyCoachBilling(admin: Admin, now: Date) {
  const day = istDay(now);
  if (!day.endsWith('-01')) return { coaches_billed: 0 };
  const { data: links, error } = await admin.from('coach_clients').select('coach_id').eq('status', 'active');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.coach_id, (counts.get(l.coach_id) ?? 0) + 1);
  if (!counts.size) return { coaches_billed: 0 };

  const { data: subs } = await admin
    .from('subscriptions')
    .select('user_id, provider, provider_ref, status, quantity, current_period_end')
    .eq('plan', 'coach')
    .in('user_id', [...counts.keys()]);
  const subBy = new Map((subs ?? []).map((s) => [s.user_id as string, s]));
  let billed = 0;

  for (const [coach, n] of counts) {
    const sub = subBy.get(coach);
    const active =
      sub?.status === 'active' && (!sub.current_period_end || Date.parse(sub.current_period_end) > now.getTime());
    const { error: upsertError } = await admin.from('coach_billing').upsert(
      {
        coach_id: coach,
        period: day,
        active_clients: n,
        amount: n * PRICE_PER_CLIENT,
        status: active ? 'covered' : 'unpaid',
        provider_ref: sub?.provider_ref ?? null,
      },
      { onConflict: 'coach_id,period' },
    );
    if (upsertError) {
      console.error('coach billing row failed', coach, upsertError);
      continue;
    }
    billed++;
    if (active && sub.provider_ref && sub.quantity !== n) {
      try {
        await updateQuantity(sub.provider, sub.provider_ref, n);
        await admin.from('subscriptions').update({ quantity: n }).eq('user_id', coach);
      } catch (e) {
        console.error('quantity update failed', coach, e);
      }
    }
  }
  return { coaches_billed: billed };
}
