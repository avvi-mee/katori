// Server-side meal pipeline shared by analyze-meal, log-text and confirm-meal.
import { AiUnavailable, generateText, type AiResult, type Prompt, type Provider } from './ai.ts';
import { checkQuota, limitsFromEnv } from './gen/features/billing/quota.ts';
import {
  applyUsual,
  buildQuestions,
  normalizeItem,
  type Food,
  type PortionContext,
  type Usual,
} from './gen/features/portions/engine.ts';
import { parseAiReply, repairPrompt, type AiReply } from './gen/features/scan/prompt.ts';
import { istDay, istDayRange } from './gen/lib/day.ts';
import type { DraftItem, MealSource, MealType, Question } from './gen/types/meal.ts';
import { COACH_PROFILE_COLUMNS, type CoachProfileRow } from './coach.ts';
import { fail, type Admin } from './http.ts';

export const FOOD_COLUMNS =
  'id, name, units, density_g_per_ml, kcal_100g, protein_100g, carbs_100g, fat_100g, default_oil_g';
const MATCH_THRESHOLD = 0.35;

export type UserContext = { ctx: PortionContext; isPro: boolean; coach: CoachProfileRow };

export async function loadUserContext(admin: Admin, uid: string): Promise<UserContext> {
  const [{ data: profile, error }, { data: pro }] = await Promise.all([
    admin.from('profiles').select(`katori_ml, plate_size, ${COACH_PROFILE_COLUMNS}`).eq('id', uid).single(),
    admin.rpc('is_pro', { uid }),
  ]);
  if (error || !profile) fail('UNAUTHENTICATED', 'Profile not found.');
  return {
    ctx: { katori_ml: profile.katori_ml ?? 150, plate_size: profile.plate_size ?? 'medium' },
    isPro: pro === true,
    coach: profile as unknown as CoachProfileRow,
  };
}

/** Rate limit + daily quota; touches last_request_at so rapid retries are throttled too. */
export async function guardQuota(
  admin: Admin,
  uid: string,
  kind: 'scan' | 'text',
  isPro: boolean,
  opts: { skipQuota?: boolean } = {},
) {
  const day = istDay();
  const { data: usage } = await admin
    .from('usage')
    .select('scans, text_logs, last_request_at')
    .eq('user_id', uid)
    .eq('day', day)
    .maybeSingle();
  const code = checkQuota(
    kind,
    usage,
    isPro,
    new Date(),
    limitsFromEnv((k) => Deno.env.get(k)),
  );
  if (code === 'RATE_LIMITED') fail(code, 'Ek second ruko, phir try karo.');
  if (code && !opts.skipQuota) {
    fail(
      code,
      code === 'NEEDS_PRO' ? 'Free AI limit reached for today.' : 'Daily AI limit reached. Try again tomorrow.',
    );
  }
  await admin.rpc('bump_usage', { p_user: uid, p_day: day });
  return day;
}

export const countUsage = (admin: Admin, uid: string, day: string, field: 'p_scans' | 'p_text_logs') =>
  admin.rpc('bump_usage', { p_user: uid, p_day: day, [field]: 1 });

export async function usualDishNames(admin: Admin, uid: string): Promise<string[]> {
  const { data } = await admin
    .from('user_dish_defaults')
    .select('times_used, food_items(name)')
    .eq('user_id', uid)
    .order('times_used', { ascending: false })
    .limit(10);
  // Many-to-one embeds come back as an object; untyped clients describe them as arrays.
  return (data ?? [])
    .map((r) => {
      const f = r.food_items as unknown as { name: string } | { name: string }[] | null;
      return Array.isArray(f) ? f[0]?.name : f?.name;
    })
    .filter((n): n is string => !!n);
}

/** Call the model; if the reply doesn't match the schema, one repair call, then AI_UNAVAILABLE. */
export async function runAi(
  first: () => Promise<AiResult>,
  provider: Provider,
  prompt: Prompt,
): Promise<{ reply: AiReply; meta: AiResult }> {
  try {
    const meta = await first();
    const parsed = parseAiReply(meta.text);
    if (parsed.ok) return { reply: parsed.value, meta };
    const repaired = await generateText(provider, { ...prompt, user: repairPrompt(meta.text, parsed.error) });
    const again = parseAiReply(repaired.text);
    if (again.ok) {
      return {
        reply: again.value,
        meta: { ...repaired, latencyMs: meta.latencyMs + repaired.latencyMs, costUsd: meta.costUsd + repaired.costUsd },
      };
    }
    console.warn('AI reply invalid after repair', again.error);
  } catch (e) {
    if (!(e instanceof AiUnavailable)) throw e;
    console.warn(e.message);
  }
  fail('AI_UNAVAILABLE', 'Could not read this meal. Type it instead?');
}

export async function loadFoods(admin: Admin, ids: string[]): Promise<Map<string, Food>> {
  if (!ids.length) return new Map();
  const { data, error } = await admin.from('food_items').select(FOOD_COLUMNS).in('id', ids);
  if (error) throw error;
  return new Map(
    (data as Food[]).map((f) => [
      f.id,
      { ...f, density_g_per_ml: f.density_g_per_ml === null ? null : Number(f.density_g_per_ml) },
    ]),
  );
}

export async function loadUsual(admin: Admin, uid: string, foodIds: string[]): Promise<Map<string, Usual>> {
  if (!foodIds.length) return new Map();
  const { data } = await admin
    .from('user_dish_defaults')
    .select('food_item_id, unit, qty, oil_level, times_used')
    .eq('user_id', uid)
    .in('food_item_id', foodIds);
  return new Map(((data ?? []) as Usual[]).map((u) => [u.food_item_id, { ...u, qty: Number(u.qty) }]));
}

async function matchFood(admin: Admin, dish: string, key: string): Promise<string | null> {
  for (const q of [dish, key.replaceAll('_', ' ')]) {
    const { data } = await admin.rpc('match_food_item', { q, max_results: 1 });
    const best = (data as { id: string; score: number }[] | null)?.[0];
    if (best && best.score >= MATCH_THRESHOLD) return best.id;
  }
  return null;
}

export type DraftResponse = {
  draft_id: string;
  items: DraftItem[];
  questions: Question[];
  source_guess: MealSource | 'unknown';
  unmatched: string[];
};

/** AI reply → matched, normalized items + ≤3 questions, stored as a meal_drafts row. */
export async function createDraft(
  admin: Admin,
  uid: string,
  reply: AiReply,
  o: {
    ctx: PortionContext;
    mealType: MealType;
    source?: MealSource;
    inputMode: 'photo' | 'text' | 'telegram';
    photoPath?: string;
    meta?: AiResult;
  },
): Promise<DraftResponse> {
  if (reply.not_food || reply.items.length === 0) fail('BAD_IMAGE', 'No food spotted.');

  const matched = await Promise.all(
    reply.items.map(async (it) => ({ it, id: await matchFood(admin, it.dish, it.key) })),
  );
  const foodIds = [...new Set(matched.map((m) => m.id).filter((x): x is string => !!x))];
  const [foods, usual] = await Promise.all([loadFoods(admin, foodIds), loadUsual(admin, uid, foodIds)]);

  const items: DraftItem[] = matched.map(({ it, id }) => {
    const draft: DraftItem = {
      key: it.key,
      dish: it.dish,
      food_item_id: id,
      unit: it.unit,
      qty: it.qty,
      confidence: it.confidence,
      cooked: it.cooked,
    };
    const food = id ? foods.get(id) : undefined;
    if (!food) return draft;
    return applyUsual(normalizeItem({ ...draft, dish: food.name }, food, o.ctx), usual.get(food.id));
  });

  const sourceGuess: MealSource | 'unknown' = o.source ?? reply.source_guess;
  const questions = buildQuestions(items, foods, o.ctx, { sourceKnown: sourceGuess !== 'unknown', usual });

  const { data, error } = await admin
    .from('meal_drafts')
    .insert({
      user_id: uid,
      meal_type: o.mealType,
      source: sourceGuess === 'unknown' ? null : sourceGuess,
      input_mode: o.inputMode,
      photo_path: o.photoPath ?? null,
      items,
      questions,
      provider: o.meta?.provider ?? null,
      latency_ms: o.meta?.latencyMs ?? null,
      cost_usd: o.meta?.costUsd ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  return {
    draft_id: data.id,
    items,
    questions,
    source_guess: sourceGuess,
    unmatched: items.filter((i) => !i.food_item_id).map((i) => i.dish),
  };
}

export async function dayTotals(admin: Admin, uid: string, at: Date) {
  const { from, to } = istDayRange(istDay(at));
  const { data } = await admin
    .from('meals')
    .select('kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g')
    .eq('user_id', uid)
    .gte('eaten_at', from)
    .lt('eaten_at', to);
  const rows = (data ?? []) as Record<'kcal' | 'kcal_low' | 'kcal_high' | 'protein_g' | 'carbs_g' | 'fat_g', number>[];
  const sum = (k: keyof (typeof rows)[number]) => Math.round(rows.reduce((a, r) => a + Number(r[k]), 0) * 10) / 10;
  return {
    kcal: sum('kcal'),
    kcal_low: sum('kcal_low'),
    kcal_high: sum('kcal_high'),
    protein_g: sum('protein_g'),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
    meals: rows.length,
  };
}
