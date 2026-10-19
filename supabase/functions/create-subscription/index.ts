// create-subscription: { plan } → checkout for Razorpay (subscription id for Checkout.js) or Dodo (hosted URL).
// plan 'coach' is the trainer plan: quantity = active clients (at least 1), coaches only.
// Pro is never granted here; only a verified payments-webhook event activates it.
import { z } from 'npm:zod@4.6.7';

import { createCheckout, providerFromEnv } from '../_shared/billing.ts';
import { adminClient, fail, json, readBody, requireUser, serve } from '../_shared/http.ts';

const Body = z.object({ plan: z.enum(['monthly', 'yearly', 'coach']) });

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const { plan } = await readBody(req, Body);

  const { data: current } = await admin
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();
  if (
    current?.status === 'active' &&
    (!current.current_period_end || Date.parse(current.current_period_end) > Date.now())
  ) {
    fail('BAD_REQUEST', 'You are already Pro.');
  }

  let quantity = 1;
  if (plan === 'coach') {
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'coach') fail('BAD_REQUEST', 'The trainer plan is for coaches.');
    const { count } = await admin
      .from('coach_clients')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id)
      .eq('status', 'active');
    quantity = Math.max(1, count ?? 0);
  }

  const provider = providerFromEnv();
  const appUrl = Deno.env.get('APP_URL') ?? 'https://katori.unmatrix.in';
  const checkout = await createCheckout(provider, {
    userId: user.id,
    email: user.email,
    plan,
    quantity,
    returnUrl: plan === 'coach' ? `${appUrl}/coach/billing?checkout=done` : `${appUrl}/?checkout=done`,
  });

  // Remember the pending checkout so the webhook can find the user even without provider metadata.
  await admin.from('subscriptions').upsert(
    {
      user_id: user.id,
      provider,
      plan,
      quantity,
      status: 'created',
      provider_ref: checkout.kind === 'razorpay' ? checkout.subscription_id : null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  return json(checkout);
});
