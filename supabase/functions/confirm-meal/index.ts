// confirm-meal: taps → grams (user's katori/plate) → macros from food_items → saved meal + "my usual".
// Two modes: { draft_id, answers } from a scan/text draft, or { items } for manual / offline logging.
// client_id makes retries from the offline outbox idempotent.
import { ConfirmBody, confirmMeal } from '../_shared/confirm.ts';
import { adminClient, json, readBody, requireUser, serve } from '../_shared/http.ts';

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  return json(await confirmMeal(admin, user.id, await readBody(req, ConfirmBody)));
});
