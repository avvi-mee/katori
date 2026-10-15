// confirm-meal: taps → grams (user's katori/plate) → macros from food_items → saved meal + "my usual".
// Two modes: { draft_id, answers } from a scan/text draft, or { items } for manual / offline logging.
// client_id makes retries from the offline outbox idempotent.
import { z } from 'npm:zod@4.6.7';

import { applyAnswers, computeItem, totals, type ComputedItem } from '../_shared/gen/features/portions/engine.ts';
import {
  Answer,
  MealSource,
  MealType,
  OilLevel,
  Unit,
  type DraftItem,
  type Question,
} from '../_shared/gen/types/meal.ts';
import { adminClient, fail, json, readBody, requireUser, serve, type Admin } from '../_shared/http.ts';
import { recentTotals, writeCoach } from '../_shared/coach.ts';
import { buildFacts } from '../_shared/gen/features/personas/facts.ts';
import { istDay } from '../_shared/gen/lib/day.ts';
import { dayTotals, loadFoods, loadUsual, loadUserContext } from '../_shared/meals.ts';

const Common = { client_id: z.string().uuid(), eaten_at: z.string().datetime().optional() };
const Body = z.union([
  z.object({ ...Common, draft_id: z.string().uuid(), answers: z.array(Answer).max(10) }),
  z.object({
    ...Common,
    meal_type: MealType,
    source: MealSource.default('home'),
    items: z
      .array(
        z.object({
          food_item_id: z.string().uuid(),
          unit: Unit,
          qty: z.number().positive().max(2000),
          oil_level: OilLevel.nullable().optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
]);

const DRAFT_TTL_MS = 24 * 3600_000;

/** Offline saves keep their original time, but never in the future or more than a week back. */
function eatenAt(raw: string | undefined): Date {
  const now = Date.now();
  const t = raw ? Date.parse(raw) : now;
  return new Date(Math.min(Math.max(t, now - 7 * 86_400_000), now + 5 * 60_000));
}

async function existingMeal(admin: Admin, uid: string, clientId: string) {
  const { data } = await admin
    .from('meals')
    .select('*, meal_items(*)')
    .eq('user_id', uid)
    .eq('client_id', clientId)
    .maybeSingle();
  return data;
}

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const body = await readBody(req, Body);

  const replay = await existingMeal(admin, user.id, body.client_id);
  if (replay)
    return json({
      meal_id: replay.id,
      items: replay.meal_items,
      ...pick(replay),
      day_totals: await dayTotals(admin, user.id, new Date(replay.eaten_at)),
      coach_message: null,
      duplicate: true,
    });

  const { ctx, isPro, coach } = await loadUserContext(admin, user.id);
  let computed: ComputedItem[];
  let source: z.infer<typeof MealSource>;
  let mealType: z.infer<typeof MealType>;
  let inputMode: 'photo' | 'text' | 'manual';
  let photoPath: string | null = null;
  let draftId: string | null = null;
  let unmatched: string[] = [];
  let rejected: string[] = [];

  if ('draft_id' in body) {
    const { data: draft } = await admin
      .from('meal_drafts')
      .select('*')
      .eq('id', body.draft_id)
      .eq('user_id', user.id)
      .is('consumed_at', null)
      .maybeSingle();
    if (!draft || Date.now() - Date.parse(draft.created_at) > DRAFT_TTL_MS)
      fail('NOT_FOUND', 'This scan expired. Please scan again.');
    const items = draft.items as DraftItem[];
    const questions = draft.questions as Question[];
    const ids = items.map((i) => i.food_item_id).filter((x): x is string => !!x);
    const [foods, usual] = await Promise.all([loadFoods(admin, ids), loadUsual(admin, user.id, ids)]);
    const result = applyAnswers(items, questions, body.answers, foods, ctx, {
      sourceGuess: draft.source ?? 'unknown',
      usual,
    });
    ({ source, unmatched, rejected } = result);
    computed = result.items;
    mealType = draft.meal_type;
    inputMode = draft.input_mode;
    photoPath = draft.photo_path;
    draftId = draft.id;
  } else {
    const foods = await loadFoods(
      admin,
      body.items.map((i) => i.food_item_id),
    );
    source = body.source;
    mealType = body.meal_type;
    inputMode = 'manual';
    computed = body.items.flatMap((it, n) => {
      const food = foods.get(it.food_item_id);
      if (!food) return [];
      return [
        computeItem(
          food,
          {
            key: `item_${n}`,
            dish: food.name,
            unit: it.unit,
            qty: it.qty,
            oil_level: it.oil_level ?? null,
            confidence: 1,
            certainty: 'asked',
          },
          ctx,
          source,
        ),
      ];
    });
  }

  if (!computed.length) fail('BAD_REQUEST', 'Nothing we could count in this meal.');

  const t = totals(computed);
  const at = eatenAt(body.eaten_at);
  const { data: meal, error } = await admin
    .from('meals')
    .insert({
      user_id: user.id,
      client_id: body.client_id,
      eaten_at: at.toISOString(),
      meal_type: mealType,
      source,
      photo_path: photoPath,
      input_mode: inputMode,
      ...t,
    })
    .select('id')
    .single();
  if (error) {
    // Lost a race with a concurrent retry of the same client_id: return the saved meal.
    const again = error.code === '23505' ? await existingMeal(admin, user.id, body.client_id) : null;
    if (again)
      return json({
        meal_id: again.id,
        items: again.meal_items,
        ...pick(again),
        day_totals: await dayTotals(admin, user.id, at),
        coach_message: null,
        duplicate: true,
      });
    throw error;
  }

  const { error: itemsError } = await admin.from('meal_items').insert(
    computed.map((c) => ({
      meal_id: meal.id,
      food_item_id: c.food_item_id,
      dish: c.dish,
      unit: c.unit,
      qty: c.qty,
      grams: c.grams,
      oil_level: c.oil_level,
      oil_g: c.oil_g,
      kcal: c.kcal,
      protein_g: c.protein_g,
      carbs_g: c.carbs_g,
      fat_g: c.fat_g,
      confidence: c.confidence,
      user_edited: c.user_edited,
    })),
  );
  if (itemsError) {
    await admin.from('meals').delete().eq('id', meal.id);
    throw itemsError;
  }

  await updateUsual(admin, user.id, computed);
  if (draftId) await admin.from('meal_drafts').update({ consumed_at: new Date().toISOString() }).eq('id', draftId);

  const totalsByDay = await recentTotals(admin, user.id, at);
  // Muted nudges: no coach line after meals (the evening summary still lands in-app).
  const coachMessage = coach.nudges_muted
    ? null
    : await writeCoach(admin, coach, buildFacts(coach, 'meal_saved', at, totalsByDay), {
        isPro,
        day: istDay(at),
        deliveredVia: 'in_app',
        aiTimeoutMs: 3500,
      }).catch((e) => {
        console.warn('coach message failed', e);
        return null;
      });

  return json({
    meal_id: meal.id,
    items: computed,
    ...t,
    source,
    unmatched,
    rejected,
    day_totals: await dayTotals(admin, user.id, at),
    coach_message: coachMessage,
  });
});

/** Each confirmed portion becomes the user's usual for that dish. */
async function updateUsual(admin: Admin, uid: string, items: ComputedItem[]) {
  const usual = await loadUsual(
    admin,
    uid,
    items.map((i) => i.food_item_id),
  );
  // One row per dish (a meal can list the same dish twice; upsert can't touch a row twice).
  const latest = [...new Map(items.map((i) => [i.food_item_id, i])).values()];
  await admin.from('user_dish_defaults').upsert(
    latest.map((i) => ({
      user_id: uid,
      food_item_id: i.food_item_id,
      unit: i.unit,
      qty: i.qty,
      oil_level: i.oil_level,
      times_used: (usual.get(i.food_item_id)?.times_used ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id,food_item_id' },
  );
}

function pick(m: Record<string, unknown>) {
  const { kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, source } = m;
  return { kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, source };
}
