// cancel-subscription: one-tap cancel. Renewal stops at the provider; Pro stays until the paid period ends,
// when the provider's cancelled/completed webhook closes the subscription.
import { cancelSubscription } from '../_shared/billing.ts';
import { adminClient, fail, json, requireUser, serve } from '../_shared/http.ts';

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const { data: sub } = await admin
    .from('subscriptions')
    .select('provider, provider_ref, status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!sub || sub.status !== 'active' || !sub.provider_ref) fail('NOT_FOUND', 'No active subscription.');
  if (sub.provider === 'play' || sub.provider === 'appstore')
    fail('BAD_REQUEST', 'Manage this subscription in your app store.');

  await cancelSubscription(sub.provider, sub.provider_ref, true);
  await admin.from('subscriptions').update({ cancel_at_period_end: true }).eq('user_id', user.id);
  return json({ cancel_at_period_end: true, current_period_end: sub.current_period_end });
});
