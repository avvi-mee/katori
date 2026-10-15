// server-shared: the portion confirmation engine (docs/ARCHITECTURE.md "Portion confirmation engine").
// The AI only names dishes and guesses portions; everything here turns taps into grams and grams into
// macros from food_items. Runs in confirm-meal (authoritative) and in the app (offline preview).
import type { Answer, DraftItem, MealSource, OilLevel, Question, Unit } from '../../types/meal.ts';

export type Food = {
  id: string;
  name: string;
  units: Record<string, number | string>;
  density_g_per_ml: number | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  default_oil_g: number;
};

export type PortionContext = { katori_ml: number; plate_size: 'small' | 'medium' | 'large' };

/** A row of user_dish_defaults ("my usual"). */
export type Usual = { food_item_id: string; unit: Unit; qty: number; oil_level: OilLevel | null; times_used: number };

export type ComputedItem = {
  key: string;
  dish: string;
  food_item_id: string;
  unit: Unit;
  qty: number;
  grams: number;
  oil_level: OilLevel | null;
  oil_g: number;
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  user_edited: boolean;
};

export type Totals = {
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export const CONFIDENT = 0.8;
export const MAX_QUESTIONS = 3;
/** Confirmed this many times → pre-fill silently, no question. */
export const USUAL_AFTER = 2;
export const MAX_ITEM_KCAL = 2500;

const PLATE_SCALE = { small: 0.8, medium: 1, large: 1.25 } as const;
const FULL_PLATE = 1.5;
const OIL_FACTOR: Record<OilLevel, number> = { kam: 0.5, normal: 1, zyada: 1.8 };
/** Restaurant cooking uses far more oil than home cooking. */
const OUTSIDE_OIL_FACTOR = 1.8;
const GHEE_G_PER_PIECE = { none: 0, thoda: 3, zyada: 6 } as const;
const MAX_QTY: Record<Unit, number> = {
  katori: 6,
  glass: 4,
  tbsp: 8,
  roti: 12,
  piece: 20,
  plate: 3,
  scoop: 6,
  g: 2000,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Grams in one `unit` of this food for this user, or null if the unit can't apply. */
export function gramsPerUnit(food: Food, unit: Unit, ctx: PortionContext): number | null {
  if (unit === 'g') return 1;
  const fixed = food.units[unit];
  if (typeof fixed === 'number' && fixed > 0) return unit === 'plate' ? fixed * PLATE_SCALE[ctx.plate_size] : fixed;
  const density = food.density_g_per_ml;
  if (unit === 'katori') return density ? ctx.katori_ml * density : null;
  if (unit === 'glass') return 250 * (density ?? 1);
  if (unit === 'tbsp') return 15 * (density ?? 1);
  return null;
}

/** Bring an AI item into a unit this food supports and a sane quantity. */
export function normalizeItem(item: DraftItem, food: Food, ctx: PortionContext): DraftItem {
  let { unit, qty } = item;
  if (gramsPerUnit(food, unit, ctx) === null) {
    unit = food.units.default as Unit;
    qty = 1;
  }
  qty = Math.min(Math.max(qty, unit === 'g' ? 5 : 0.25), MAX_QTY[unit]);
  return { ...item, food_item_id: food.id, unit, qty };
}

/** Pre-fill a confident "my usual" amount and treat it as certain. */
export function applyUsual(item: DraftItem, usual: Usual | undefined): DraftItem {
  if (!usual || usual.times_used < USUAL_AFTER) return item;
  return { ...item, unit: usual.unit, qty: usual.qty, confidence: 1 };
}

type Opt = { id: string; label: string; value: number };

function portionOptions(
  food: Food,
  item: DraftItem,
  ctx: PortionContext,
): { kind: Question['kind']; options: Opt[]; current: number } | null {
  switch (item.unit) {
    case 'katori':
    case 'glass': {
      const word = item.unit === 'katori' ? 'katori' : 'glass';
      return {
        kind: 'portion',
        current: item.qty,
        options: [
          { id: 'half', label: `½ ${word}`, value: 0.5 },
          { id: 'one', label: '1', value: 1 },
          { id: 'one_half', label: '1½', value: 1.5 },
          { id: 'two', label: '2', value: 2 },
        ],
      };
    }
    case 'roti':
    case 'piece':
    case 'tbsp':
      return {
        kind: 'count',
        current: item.qty,
        options: [1, 2, 3, 4].map((n) => ({ id: `n${n}`, label: n === 4 ? '4+' : String(n), value: n })),
      };
    case 'plate':
    case 'scoop': {
      const plate = gramsPerUnit(food, 'plate', ctx);
      const scoop = gramsPerUnit(food, 'scoop', ctx);
      if (!plate || !scoop) return null;
      const current = item.unit === 'plate' ? item.qty : (item.qty * scoop) / plate;
      return {
        kind: 'plate',
        current,
        options: [
          { id: 'scoop', label: 'Small scoop', value: round1(scoop / plate) },
          { id: 'medium', label: 'Medium plate', value: 1 },
          { id: 'full', label: 'Full plate', value: FULL_PLATE },
        ],
      };
    }
    default:
      return null;
  }
}

const closest = (options: Opt[], v: number) =>
  options.reduce((best, o) => (Math.abs(o.value - v) < Math.abs(best.value - v) ? o : best), options[0]!).id;

export type BuildOptions = { sourceKnown: boolean; usual?: Map<string, Usual> };

/**
 * At most 3 multiple-choice questions: one per dish below 0.8 confidence, oil for cooked dishes,
 * ghee for rotis, and ghar/bahar when the source is unknown. Most uncertain/impactful first.
 */
export function buildQuestions(
  items: DraftItem[],
  foods: Map<string, Food>,
  ctx: PortionContext,
  opts: BuildOptions,
): Question[] {
  const ranked: { priority: number; q: Question }[] = [];
  let anyCooked = false;

  for (const item of items) {
    const food = item.food_item_id ? foods.get(item.food_item_id) : undefined;
    if (!food) continue;
    const usual = opts.usual?.get(food.id);
    const isUsual = !!usual && usual.times_used >= USUAL_AFTER;

    if (item.confidence < CONFIDENT && !isUsual) {
      const p = portionOptions(food, item, ctx);
      if (p) {
        const prompt =
          p.kind === 'count'
            ? `Kitni ${item.dish}?`
            : p.kind === 'plate'
              ? `${item.dish} kitna tha?`
              : `${item.dish} kitni thi?`;
        ranked.push({
          priority: 2 - item.confidence,
          q: {
            id: `${item.key}:portion`,
            item_key: item.key,
            kind: p.kind,
            prompt,
            options: p.options,
            default_option: closest(p.options, p.current),
          },
        });
      }
    }

    if (item.unit === 'roti') {
      ranked.push({
        priority: 0.9,
        q: {
          id: `${item.key}:ghee`,
          item_key: item.key,
          kind: 'ghee',
          prompt: `${item.dish} pe ghee?`,
          options: [
            { id: 'none', label: 'Nahi', value: GHEE_G_PER_PIECE.none },
            { id: 'thoda', label: 'Thoda', value: GHEE_G_PER_PIECE.thoda },
            { id: 'zyada', label: 'Zyada', value: GHEE_G_PER_PIECE.zyada },
          ],
          default_option: 'none',
        },
      });
    }

    if (item.cooked && food.default_oil_g > 0) {
      anyCooked = true;
      if (!(isUsual && usual?.oil_level)) {
        const grams = item.qty * (gramsPerUnit(food, item.unit, ctx) ?? 0);
        const oilG = (food.default_oil_g * grams) / 100;
        ranked.push({
          priority: 0.5 + Math.min(oilG / 40, 0.45),
          q: {
            id: `${item.key}:oil`,
            item_key: item.key,
            kind: 'oil',
            prompt: `${item.dish} mein tel?`,
            options: [
              { id: 'kam', label: 'Kam', value: OIL_FACTOR.kam },
              { id: 'normal', label: 'Normal', value: OIL_FACTOR.normal },
              { id: 'zyada', label: 'Zyada', value: OIL_FACTOR.zyada },
            ],
            default_option: 'normal',
          },
        });
      }
    }
  }

  if (anyCooked && !opts.sourceKnown) {
    ranked.push({
      priority: 0.95,
      q: {
        id: 'meal:source',
        item_key: null,
        kind: 'source',
        prompt: 'Ghar ka ya bahar ka?',
        options: [
          { id: 'home', label: 'Ghar ka', value: 0 },
          { id: 'outside', label: 'Bahar ka', value: 1 },
        ],
        default_option: 'home',
      },
    });
  }

  return ranked
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_QUESTIONS)
    .map((r) => r.q);
}

export type ItemInput = {
  key: string;
  dish: string;
  unit: Unit;
  qty: number;
  oil_level: OilLevel | null;
  ghee_g_per_piece?: number;
  confidence: number;
  /** How sure we are of the amount: asked = user tapped, usual = learned, guess = AI only. */
  certainty: 'asked' | 'usual' | 'guess';
  user_edited?: boolean;
};

const PORTION_UNCERTAINTY = { asked: 0.1, usual: 0.07, guess: 0.15 } as const;
const OIL_UNCERTAINTY = 0.35;

/** Grams → macros from the food row, adjusted for oil level, ghar/bahar and ghee. */
export function computeItem(food: Food, input: ItemInput, ctx: PortionContext, source: MealSource): ComputedItem {
  const unit = gramsPerUnit(food, input.unit, ctx) === null ? (food.units.default as Unit) : input.unit;
  const qty = Math.min(Math.max(input.qty, 0.25), MAX_QTY[unit]);
  const grams = qty * (gramsPerUnit(food, unit, ctx) ?? 100);
  const f = grams / 100;

  const includedOil = food.default_oil_g * f;
  const level = food.default_oil_g > 0 ? (input.oil_level ?? 'normal') : null;
  const oilG = level ? includedOil * OIL_FACTOR[level] * (source === 'outside' ? OUTSIDE_OIL_FACTOR : 1) : 0;
  const extraFat = oilG - includedOil + (unit === 'roti' ? (input.ghee_g_per_piece ?? 0) * qty : 0);

  const kcal = Math.max(food.kcal_100g * f + 9 * extraFat, 0);
  const spread = kcal * PORTION_UNCERTAINTY[input.certainty] + 9 * OIL_UNCERTAINTY * oilG;

  return {
    key: input.key,
    dish: input.dish,
    food_item_id: food.id,
    unit,
    qty,
    grams: round1(grams),
    oil_level: level,
    oil_g: round1(oilG),
    kcal: round1(kcal),
    kcal_low: round1(Math.max(kcal - spread, 0)),
    kcal_high: round1(kcal + spread),
    protein_g: round1(food.protein_100g * f),
    carbs_g: round1(food.carbs_100g * f),
    fat_g: round1(Math.max(food.fat_100g * f + extraFat, 0)),
    confidence: input.confidence,
    user_edited: !!input.user_edited,
  };
}

export type ApplyResult = { items: ComputedItem[]; source: MealSource; rejected: string[]; unmatched: string[] };

/** Turn the draft + the user's taps into computed items. Missing answers use the default option. */
export function applyAnswers(
  items: DraftItem[],
  questions: Question[],
  answers: Answer[],
  foods: Map<string, Food>,
  ctx: PortionContext,
  opts: { sourceGuess: MealSource | 'unknown'; usual?: Map<string, Usual> },
): ApplyResult {
  const picked = new Map(answers.map((a) => [a.question_id, a.option_id]));
  const valueOf = (qid: string) => {
    const q = questions.find((x) => x.id === qid);
    if (!q) return undefined;
    const optionId = picked.get(qid) ?? q.default_option;
    const opt = q.options.find((o) => o.id === optionId) ?? q.options.find((o) => o.id === q.default_option);
    return opt && { q, opt, changed: opt.id !== q.default_option };
  };

  const sourceAnswer = valueOf('meal:source');
  const source: MealSource = sourceAnswer
    ? sourceAnswer.opt.value === 1
      ? 'outside'
      : 'home'
    : opts.sourceGuess === 'outside'
      ? 'outside'
      : 'home';

  const out: ComputedItem[] = [];
  const rejected: string[] = [];
  const unmatched: string[] = [];

  for (const item of items) {
    const food = item.food_item_id ? foods.get(item.food_item_id) : undefined;
    if (!food) {
      unmatched.push(item.dish);
      continue;
    }
    const usual = opts.usual?.get(food.id);
    const isUsual = !!usual && usual.times_used >= USUAL_AFTER;
    const portion = valueOf(`${item.key}:portion`);
    const oil = valueOf(`${item.key}:oil`);
    const ghee = valueOf(`${item.key}:ghee`);

    let unit = item.unit;
    let qty = item.qty;
    if (portion) {
      if (portion.q.kind === 'plate') unit = 'plate';
      qty = portion.opt.value;
    }
    const oilLevel = (oil?.opt.id as OilLevel | undefined) ?? (isUsual ? usual?.oil_level : null) ?? 'normal';

    const computed = computeItem(
      food,
      {
        key: item.key,
        dish: item.dish,
        unit,
        qty,
        oil_level: oilLevel,
        ghee_g_per_piece: ghee?.opt.value ?? 0,
        confidence: item.confidence,
        certainty: portion ? 'asked' : isUsual ? 'usual' : 'guess',
        user_edited: !!(portion?.changed || oil?.changed || ghee?.changed),
      },
      ctx,
      source,
    );
    if (computed.kcal > MAX_ITEM_KCAL) rejected.push(item.dish);
    else out.push(computed);
  }
  return { items: out, source, rejected, unmatched };
}

export function totals(items: Pick<ComputedItem, keyof Totals>[]): Totals {
  const t = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      kcal_low: acc.kcal_low + i.kcal_low,
      kcal_high: acc.kcal_high + i.kcal_high,
      protein_g: acc.protein_g + i.protein_g,
      carbs_g: acc.carbs_g + i.carbs_g,
      fat_g: acc.fat_g + i.fat_g,
    }),
    { kcal: 0, kcal_low: 0, kcal_high: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  return {
    kcal: round1(t.kcal),
    kcal_low: round1(t.kcal_low),
    kcal_high: round1(t.kcal_high),
    protein_g: round1(t.protein_g),
    carbs_g: round1(t.carbs_g),
    fat_g: round1(t.fat_g),
  };
}
