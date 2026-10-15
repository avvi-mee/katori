// payments-webhook: one endpoint for both providers. Verifies the signature on the raw body before any
// state change, normalises the event, and writes the single subscriptions row.
import {
  isStale,
  parseDodo,
  parseRazorpay,
  verifyRazorpay,
  verifyStandardWebhook,
  type BillingEvent,
} from '../_shared/gen/features/billing/webhook.ts';
import { planIds, productIds } from '../_shared/billing.ts';
import { adminClient, json } from '../_shared/http.ts';

const ok = (body: Record<string, unknown> = { ok: true }) => json(body, 200);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: { code: 'BAD_REQUEST', message: 'POST only' } }, 405);
  const raw = await req.text();

  let event: BillingEvent | null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: { code: 'BAD_REQUEST', message: 'invalid JSON' } }, 400);
  }

  if (req.headers.has('x-razorpay-signature')) {
    const valid = await verifyRazorpay(
      raw,
      req.headers.get('x-razorpay-signature'),
      Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '',
    );
    if (!valid) return json({ error: { code: 'UNAUTHENTICATED', message: 'bad signature' } }, 401);
    event = parseRazorpay(payload, planIds());
  } else if (req.headers.has('webhook-signature')) {
    const valid = await verifyStandardWebhook(
      raw,
      {
        id: req.headers.get('webhook-id'),
        timestamp: req.headers.get('webhook-timestamp'),
        signature: req.headers.get('webhook-signature'),
      },
      Deno.env.get('DODO_WEBHOOK_SECRET') ?? '',
    );
    if (!valid) return json({ error: { code: 'UNAUTHENTICATED', message: 'bad signature' } }, 401);
    event = parseDodo(payload, productIds());
  } else {
    return json({ error: { code: 'UNAUTHENTICATED', message: 'unsigned' } }, 401);
  }

  // Verified but not a subscription state change we track: acknowledge so the provider stops retrying.
  if (!event) return ok({ ignored: true });

  const admin = adminClient();
  const { data: byRef } = await admin
    .from('subscriptions')
    .select('user_id, plan, updated_at')
    .eq('provider_ref', event.ref)
    .maybeSingle();
  const userId = event.user_id ?? byRef?.user_id ?? null;
  if (!userId) {
    console.error('webhook for unknown subscription', event.provider, event.ref, event.event);
    return ok({ ignored: true, reason: 'unknown user' });
  }

  const { data: current } = await admin
    .from('subscriptions')
    .select('plan, updated_at, provider_ref')
    .eq('user_id', userId)
    .maybeSingle();
  // Retries can arrive out of order; never let an older event overwrite newer state for the same subscription.
  if (current?.provider_ref === event.ref && isStale(event, current.updated_at))
    return ok({ ignored: true, reason: 'stale' });

  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      provider: event.provider,
      plan: event.plan ?? current?.plan ?? byRef?.plan ?? 'monthly',
      status: event.status,
      current_period_end: event.current_period_end,
      provider_ref: event.ref,
      ...(event.status === 'active' ? {} : { cancel_at_period_end: false }),
      updated_at: event.event_at,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('subscription upsert failed', error);
    return json({ error: { code: 'INTERNAL', message: 'retry' } }, 500);
  }
  return ok();
});
