// coach-comment: a trainer comments on (or reacts to) an active client's meal; the client gets a push and
// sees "Coach reviewed your lunch". The link is checked here because meal_comments has no insert policy.
import { z } from 'npm:zod@4.6.7';

import { adminClient, fail, json, readBody, requireUser, serve } from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';

const Body = z
  .object({
    meal_id: z.string().uuid(),
    body: z.string().trim().min(1).max(1000).optional(),
    reaction: z.enum(['great', 'protein', 'portion', 'oil', 'veggies']).optional(),
  })
  .refine((b) => b.body || b.reaction, 'comment or reaction required');

const REACTION_TEXT: Record<string, string> = {
  great: 'Great meal 👏',
  protein: 'Add more protein 💪',
  portion: 'Watch the portion 🍽️',
  oil: 'Go easy on the oil 🫗',
  veggies: 'Add some veggies 🥗',
};
const MEAL_WORD: Record<string, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack' };

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const input = await readBody(req, Body);

  const { data: meal } = await admin
    .from('meals')
    .select('id, user_id, meal_type')
    .eq('id', input.meal_id)
    .maybeSingle();
  if (!meal) fail('NOT_FOUND', 'Meal not found.');
  const { data: link } = await admin
    .from('coach_clients')
    .select('id')
    .eq('coach_id', user.id)
    .eq('client_id', meal.user_id)
    .eq('status', 'active')
    .maybeSingle();
  // Same answer as a missing meal: don't reveal meals of people you don't coach.
  if (!link) fail('NOT_FOUND', 'Meal not found.');

  const { data: comment, error } = await admin
    .from('meal_comments')
    .insert({ meal_id: meal.id, author_id: user.id, body: input.body ?? null, reaction: input.reaction ?? null })
    .select('id, meal_id, author_id, body, reaction, created_at, read_at')
    .single();
  if (error) throw error;

  const { data: coach } = await admin.from('profiles').select('name').eq('id', user.id).single();
  const name = coach?.name ?? 'Your coach';
  await sendPush(admin, meal.user_id, {
    title: `${name} reviewed your ${MEAL_WORD[meal.meal_type] ?? 'meal'}`,
    body: input.body ?? REACTION_TEXT[input.reaction!] ?? '',
    url: `/?meal=${meal.id}`,
    tag: `comment-${meal.id}`,
  }).catch((e) => console.error('comment push failed', e));

  return json({ comment });
});
