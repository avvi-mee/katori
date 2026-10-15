// create-subscription: { plan } → checkout for Razorpay (subscription id for Checkout.js) or Dodo (hosted URL).
// Pro is never granted here; only a verified payments-webhook event activates it.
import { z } from 'npm:zod@4.6.7';

import { createCheckout, providerFromEnv } from '../_shared/billing.ts';
import { adminClient, fail, json, readBody, requireUser, serve } from '../_shared/http.ts';

const Body = z.object({ plan: z.enum(['monthly', 'yearly']) });

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

  const provider = providerFromEnv();
  const appUrl = Deno.env.get('APP_URL') ?? 'https://katori.unmatrix.in';
  const checkout = await createCheckout(provider, {
    userId: user.id,
    email: user.email,
    plan,
    returnUrl: `${appUrl}/?checkout=done`,
  });

  // Remember the pending checkout so the webhook can find the user even without provider metadata.
  await admin.from('subscriptions').upsert(
    {
      user_id: user.id,
      provider,
      plan,
      status: 'created',
      provider_ref: checkout.kind === 'razorpay' ? checkout.subscription_id : null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  return json(checkout);
});
