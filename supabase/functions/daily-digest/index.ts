// daily-digest: pg_cron calls this at 9 pm IST. For every onboarded user: evening summary + tomorrow's
// one fix in their coach's voice, saved in-app and sent as web push (unless nudges are muted).
// Also the nightly cleanup (photos after 30 days, stale drafts, old usage counters) and, on Mondays, the
// weekly adaptive calorie recalculation.
import { personaMeta } from '../_shared/gen/features/personas/personas.ts';
import { addDays, istDay, istDayRange } from '../_shared/gen/lib/day.ts';
import { COACH_PROFILE_COLUMNS, writeCoach, type CoachProfileRow } from '../_shared/coach.ts';
import { buildFacts, groupByDay } from '../_shared/gen/features/personas/facts.ts';
import { adminClient, fail, json, serve, type Admin } from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';
import { weeklyRecalcAll } from '../_shared/recalc.ts';

const PAGE = 200;
const PHOTO_DAYS = 30;

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) fail('UNAUTHENTICATED', 'cron only');

  const admin = adminClient();
  const now = new Date();
  const day = istDay(now);
  const { from } = istDayRange(addDays(day, -2));
  const { to } = istDayRange(day);
  let users = 0;
  let pushed = 0;

  // shortcut: one pass over all users inside a single invocation; move to a queue past a few thousand users.
  for (let offset = 0; ; offset += PAGE) {
    const { data: profiles, error } = await admin
      .from('profiles')
      .select(COACH_PROFILE_COLUMNS)
      .not('onboarded_at', 'is', null)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!profiles?.length) break;
    const ids = profiles.map((p) => p.id);

    const [{ data: meals }, { data: subs }] = await Promise.all([
      admin
        .from('meals')
        .select('user_id, eaten_at, kcal, protein_g')
        .in('user_id', ids)
        .gte('eaten_at', from)
        .lt('eaten_at', to),
      admin
        .from('subscriptions')
        .select('user_id, status, current_period_end')
        .in('user_id', ids)
        .eq('status', 'active'),
    ]);
    const pro = new Set(
      (subs ?? [])
        .filter((s) => !s.current_period_end || Date.parse(s.current_period_end) > now.getTime())
        .map((s) => s.user_id),
    );
    const byUser = new Map<string, { eaten_at: string; kcal: number; protein_g: number }[]>();
    for (const m of meals ?? []) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);

    for (const p of profiles as CoachProfileRow[]) {
      const facts = buildFacts(p, 'daily_digest', now, groupByDay(byUser.get(p.id) ?? []));
      try {
        const reply = await writeCoach(admin, p, facts, {
          isPro: pro.has(p.id),
          day,
          deliveredVia: p.nudges_muted ? 'in_app' : 'push',
          aiTimeoutMs: 8000,
        });
        if (!p.nudges_muted) {
          pushed += await sendPush(admin, p.id, {
            title: personaMeta[p.persona].name,
            body: reply.text,
            url: '/',
            tag: `digest-${day}`,
          });
        }
        users++;
      } catch (e) {
        console.error('digest failed for user', p.id, e);
      }
    }
  }

  // Before the digest would be ideal, but a failed recalc must never block anyone's evening message.
  const recalc = await weeklyRecalcAll(admin, now).catch((e) => {
    console.error('weekly recalc failed', e);
    return { recalculated: 0 };
  });
  const cleaned = await cleanup(admin, now);
  return json({ day, users, pushed, ...recalc, ...cleaned });
});

/** Photos are auto-deleted after 30 days; unconfirmed drafts after 7; usage counters after 90. */
async function cleanup(admin: Admin, now: Date) {
  const photoCutoff = new Date(now.getTime() - PHOTO_DAYS * 86_400_000).toISOString();
  const draftCutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const { data: oldMeals } = await admin
    .from('meals')
    .select('id, photo_path')
    .not('photo_path', 'is', null)
    .lt('created_at', photoCutoff)
    .limit(1000);
  const { data: oldDrafts } = await admin
    .from('meal_drafts')
    .select('id, photo_path, consumed_at')
    .lt('created_at', draftCutoff)
    .limit(1000);

  // Unconfirmed drafts own their photo; confirmed ones share it with a meal (removed on the meal's schedule).
  const paths = [
    ...(oldMeals ?? []).map((m) => m.photo_path as string),
    ...(oldDrafts ?? []).filter((d) => d.photo_path && !d.consumed_at).map((d) => d.photo_path as string),
  ];
  if (paths.length) await admin.storage.from('meal-photos').remove(paths);
  if (oldMeals?.length)
    await admin
      .from('meals')
      .update({ photo_path: null })
      .in(
        'id',
        oldMeals.map((m) => m.id),
      );
  if (oldDrafts?.length)
    await admin
      .from('meal_drafts')
      .delete()
      .in(
        'id',
        oldDrafts.map((d) => d.id),
      );
  await admin
    .from('usage')
    .delete()
    .lt('day', istDay(new Date(now.getTime() - 90 * 86_400_000)));

  return { photos_removed: paths.length, drafts_removed: oldDrafts?.length ?? 0 };
}
