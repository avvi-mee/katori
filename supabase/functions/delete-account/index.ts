// delete-account: stops billing, removes every photo in the user's folder, then deletes the auth user.
// All rows (profile, meals, items, usual, coach messages, usage, subscription, drafts, push) cascade
// from auth.users via ON DELETE CASCADE.
import { cancelSubscription } from '../_shared/billing.ts';
import { adminClient, json, requireUser, serve } from '../_shared/http.ts';

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);

  const { data: sub } = await admin
    .from('subscriptions')
    .select('provider, provider_ref, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (sub?.status === 'active' && sub.provider_ref && (sub.provider === 'razorpay' || sub.provider === 'dodo')) {
    // Stop charging immediately; failure here must not block deletion, so it is logged.
    await cancelSubscription(sub.provider, sub.provider_ref, false).catch((e) =>
      console.error('cancel on delete failed', e),
    );
  }

  const bucket = admin.storage.from('meal-photos');
  for (let guard = 0; guard < 100; guard++) {
    const { data: files, error } = await bucket.list(user.id, { limit: 1000 });
    if (error) throw error;
    if (!files?.length) break;
    const { error: rmError } = await bucket.remove(files.map((f) => `${user.id}/${f.name}`));
    if (rmError) throw rmError;
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
});
