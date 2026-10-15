import { describe, expect, it } from 'vitest';

import {
  applyAnswers,
  applyUsual,
  buildQuestions,
  computeItem,
  gramsPerUnit,
  normalizeItem,
  totals,
  type Food,
  type PortionContext,
  type Usual,
} from '@/features/portions/engine';
import type { DraftItem } from '@/types/meal';

const food = (o: Partial<Food> & Pick<Food, 'id' | 'name'>): Food => ({
  units: { default: 'katori' },
  density_g_per_ml: null,
  kcal_100g: 100,
  protein_100g: 5,
  carbs_100g: 10,
  fat_100g: 4,
  default_oil_g: 0,
  ...o,
});

const DAL = food({
  id: 'dal',
  name: 'Dal Tadka',
  density_g_per_ml: 1.03,
  kcal_100g: 120.5,
  protein_100g: 6,
  carbs_100g: 14,
  fat_100g: 4.5,
  default_oil_g: 4,
});
const ROTI = food({
  id: 'roti',
  name: 'Roti',
  units: { default: 'roti', roti: 40 },
  kcal_100g: 258.5,
  protein_100g: 9,
  carbs_100g: 50,
  fat_100g: 2.5,
});
const RICE = food({
  id: 'rice',
  name: 'Steamed Rice',
  units: { default: 'plate', scoop: 120, plate: 250 },
  density_g_per_ml: 0.75,
  kcal_100g: 127.5,
  protein_100g: 2.7,
  carbs_100g: 28.5,
  fat_100g: 0.3,
});
const CHAI = food({
  id: 'chai',
  name: 'Masala Chai',
  units: { default: 'glass', glass: 150 },
  kcal_100g: 55,
  protein_100g: 1.8,
  carbs_100g: 8,
  fat_100g: 1.8,
});
const HUGE = food({
  id: 'huge',
  name: 'Huge',
  units: { default: 'piece', piece: 1000 },
  kcal_100g: 600,
  protein_100g: 10,
  carbs_100g: 50,
  fat_100g: 40,
});
const FOODS = new Map([DAL, ROTI, RICE, CHAI, HUGE].map((f) => [f.id, f]));

const MED: PortionContext = { katori_ml: 150, plate_size: 'medium' };
const item = (o: Partial<DraftItem> & Pick<DraftItem, 'key' | 'dish' | 'food_item_id' | 'unit'>): DraftItem => ({
  qty: 1,
  confidence: 0.9,
  cooked: false,
  ...o,
});

describe('gramsPerUnit', () => {
  it('uses the user’s calibrated katori × density', () => {
    expect(gramsPerUnit(DAL, 'katori', MED)).toBeCloseTo(154.5);
    expect(gramsPerUnit(DAL, 'katori', { ...MED, katori_ml: 100 })).toBeCloseTo(103);
  });
  it('scales plates with the user’s plate size, not scoops', () => {
    expect(gramsPerUnit(RICE, 'plate', MED)).toBe(250);
    expect(gramsPerUnit(RICE, 'plate', { ...MED, plate_size: 'large' })).toBe(312.5);
    expect(gramsPerUnit(RICE, 'plate', { ...MED, plate_size: 'small' })).toBe(200);
    expect(gramsPerUnit(RICE, 'scoop', { ...MED, plate_size: 'large' })).toBe(120);
  });
  it('uses per-piece grams and volume fallbacks', () => {
    expect(gramsPerUnit(ROTI, 'roti', MED)).toBe(40);
    expect(gramsPerUnit(CHAI, 'glass', MED)).toBe(150);
    expect(gramsPerUnit(DAL, 'tbsp', MED)).toBeCloseTo(15.45);
    expect(gramsPerUnit(DAL, 'g', MED)).toBe(1);
  });
  it('returns null when a unit cannot apply', () => {
    expect(gramsPerUnit(ROTI, 'katori', MED)).toBeNull();
    expect(gramsPerUnit(DAL, 'piece', MED)).toBeNull();
  });
});

describe('normalizeItem', () => {
  it('falls back to the food’s default unit when the AI picks an impossible one', () => {
    const n = normalizeItem(item({ key: 'dal', dish: 'Dal', food_item_id: null, unit: 'piece', qty: 3 }), DAL, MED);
    expect(n).toMatchObject({ unit: 'katori', qty: 1, food_item_id: 'dal' });
  });
  it('clamps absurd quantities', () => {
    expect(
      normalizeItem(item({ key: 'r', dish: 'Roti', food_item_id: null, unit: 'roti', qty: 40 }), ROTI, MED).qty,
    ).toBe(12);
  });
});

describe('computeItem', () => {
  const base = {
    key: 'dal',
    dish: 'Dal',
    unit: 'katori' as const,
    qty: 1,
    confidence: 0.9,
    certainty: 'guess' as const,
  };

  it('computes macros from food_items × grams at home-normal oil', () => {
    const c = computeItem(DAL, { ...base, oil_level: 'normal' }, MED, 'home');
    expect(c.grams).toBe(154.5);
    expect(c.kcal).toBeCloseTo(186.2, 1);
    expect(c.protein_g).toBeCloseTo(9.3, 1);
    expect(c.oil_g).toBeCloseTo(6.2, 1);
  });

  it('kam oil removes half of the included oil; zyada + bahar adds a lot', () => {
    const normal = computeItem(DAL, { ...base, oil_level: 'normal' }, MED, 'home').kcal;
    const kam = computeItem(DAL, { ...base, oil_level: 'kam' }, MED, 'home').kcal;
    const heavy = computeItem(DAL, { ...base, oil_level: 'zyada' }, MED, 'outside');
    expect(normal - kam).toBeCloseTo(9 * 0.5 * 6.18, 0);
    // 6.18 g × 1.8 × 1.8 = 20.02 g oil → +13.84 g fat over home-normal
    expect(heavy.oil_g).toBeCloseTo(20, 0);
    expect(heavy.kcal - normal).toBeCloseTo(9 * 13.84, 0);
  });

  it('adds ghee per roti', () => {
    const c = computeItem(
      ROTI,
      {
        key: 'roti',
        dish: 'Roti',
        unit: 'roti',
        qty: 2,
        oil_level: null,
        ghee_g_per_piece: 3,
        confidence: 1,
        certainty: 'asked',
      },
      MED,
      'home',
    );
    expect(c.kcal).toBeCloseTo(258.5 * 0.8 + 9 * 6, 1);
    expect(c.oil_level).toBeNull();
  });

  it('returns an honest range that narrows once the user confirms or it is their usual', () => {
    const guess = computeItem(DAL, { ...base, oil_level: 'normal' }, MED, 'home');
    const asked = computeItem(DAL, { ...base, oil_level: 'normal', certainty: 'asked' }, MED, 'home');
    const usual = computeItem(DAL, { ...base, oil_level: 'normal', certainty: 'usual' }, MED, 'home');
    expect(guess.kcal_low).toBeLessThan(guess.kcal);
    expect(guess.kcal_high).toBeGreaterThan(guess.kcal);
    expect(guess.kcal_high - guess.kcal_low).toBeGreaterThan(asked.kcal_high - asked.kcal_low);
    expect(asked.kcal_high - asked.kcal_low).toBeGreaterThan(usual.kcal_high - usual.kcal_low);
    // portion ±15% + oil ±35% × 9 kcal/g
    expect(guess.kcal_high - guess.kcal).toBeCloseTo(186.17 * 0.15 + 9 * 0.35 * 6.18, 0);
  });

  it('never invents oil for foods without cooking fat', () => {
    expect(
      computeItem(
        CHAI,
        { key: 'c', dish: 'Chai', unit: 'glass', qty: 1, oil_level: 'zyada', confidence: 1, certainty: 'guess' },
        MED,
        'outside',
      ).oil_g,
    ).toBe(0);
  });
});

describe('buildQuestions', () => {
  const draft = [
    item({ key: 'dal', dish: 'Dal', food_item_id: 'dal', unit: 'katori', qty: 1.4, confidence: 0.6, cooked: true }),
    item({ key: 'roti', dish: 'Roti', food_item_id: 'roti', unit: 'roti', qty: 2, confidence: 0.9 }),
    item({ key: 'rice', dish: 'Rice', food_item_id: 'rice', unit: 'scoop', qty: 1, confidence: 0.5 }),
  ];

  it('asks at most 3 questions, most uncertain first', () => {
    const qs = buildQuestions(draft, FOODS, MED, { sourceKnown: false });
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.id)).toEqual(['rice:portion', 'dal:portion', 'meal:source']);
  });

  it('pre-selects the option closest to the AI guess', () => {
    const qs = buildQuestions(draft, FOODS, MED, { sourceKnown: true });
    expect(qs.find((q) => q.id === 'dal:portion')?.default_option).toBe('one_half');
    const rice = qs.find((q) => q.id === 'rice:portion')!;
    expect(rice.kind).toBe('plate');
    expect(rice.default_option).toBe('scoop');
  });

  it('asks oil only for cooked dishes and ghee only for rotis', () => {
    const qs = buildQuestions(
      [
        item({ key: 'dal', dish: 'Dal', food_item_id: 'dal', unit: 'katori', confidence: 0.95, cooked: true }),
        item({ key: 'chai', dish: 'Chai', food_item_id: 'chai', unit: 'glass', confidence: 0.95, cooked: true }),
      ],
      FOODS,
      MED,
      { sourceKnown: true },
    );
    expect(qs.map((q) => q.id)).toEqual(['dal:oil']);
  });

  it('asks nothing when everything is confident and nothing is cooked', () => {
    const qs = buildQuestions(
      [item({ key: 'roti', dish: 'Roti', food_item_id: 'roti', unit: 'piece', confidence: 0.95 })],
      FOODS,
      MED,
      { sourceKnown: true },
    );
    expect(qs).toEqual([]);
  });

  it('skips unmatched dishes', () => {
    expect(
      buildQuestions(
        [item({ key: 'x', dish: 'Mystery', food_item_id: null, unit: 'katori', confidence: 0.1 })],
        FOODS,
        MED,
        { sourceKnown: false },
      ),
    ).toEqual([]);
  });
});

describe('"my usual"', () => {
  const usual: Usual = { food_item_id: 'dal', unit: 'katori', qty: 1.5, oil_level: 'kam', times_used: 3 };
  const usualMap = new Map([['dal', usual]]);
  const dal = item({
    key: 'dal',
    dish: 'Dal',
    food_item_id: 'dal',
    unit: 'katori',
    qty: 1,
    confidence: 0.5,
    cooked: true,
  });

  it('pre-fills the usual amount and skips the portion + oil questions', () => {
    const filled = applyUsual(dal, usual);
    expect(filled).toMatchObject({ qty: 1.5, confidence: 1 });
    const qs = buildQuestions([filled], FOODS, MED, { sourceKnown: true, usual: usualMap });
    expect(qs).toEqual([]);
  });

  it('does not kick in before the dish has been confirmed twice', () => {
    expect(applyUsual(dal, { ...usual, times_used: 1 })).toBe(dal);
    const qs = buildQuestions([dal], FOODS, MED, {
      sourceKnown: true,
      usual: new Map([['dal', { ...usual, times_used: 1 }]]),
    });
    expect(qs.map((q) => q.id)).toEqual(['dal:portion', 'dal:oil']);
  });

  it('uses the usual oil level and narrower range when computing', () => {
    const r = applyAnswers([applyUsual(dal, usual)], [], [], FOODS, MED, { sourceGuess: 'home', usual: usualMap });
    expect(r.items[0]).toMatchObject({ oil_level: 'kam', qty: 1.5 });
  });
});

describe('applyAnswers', () => {
  const draft = [
    item({ key: 'dal', dish: 'Dal', food_item_id: 'dal', unit: 'katori', qty: 1, confidence: 0.6, cooked: true }),
    item({ key: 'rice', dish: 'Rice', food_item_id: 'rice', unit: 'scoop', qty: 1, confidence: 0.5 }),
    item({ key: 'momo', dish: 'Mystery momo', food_item_id: null, unit: 'piece', qty: 6, confidence: 0.4 }),
  ];
  const qs = buildQuestions(draft, FOODS, MED, { sourceKnown: false });

  it('uses defaults for unanswered questions ("Looks right")', () => {
    const r = applyAnswers(draft, qs, [], FOODS, MED, { sourceGuess: 'unknown' });
    expect(r.source).toBe('home');
    expect(r.items.map((i) => i.key)).toEqual(['dal', 'rice']);
    expect(r.items.every((i) => !i.user_edited)).toBe(true);
    expect(r.unmatched).toEqual(['Mystery momo']);
  });

  it('applies taps: full plate of rice, bahar ka', () => {
    const r = applyAnswers(
      draft,
      qs,
      [
        { question_id: 'rice:portion', option_id: 'full' },
        { question_id: 'meal:source', option_id: 'outside' },
      ],
      FOODS,
      MED,
      { sourceGuess: 'unknown' },
    );
    const rice = r.items.find((i) => i.key === 'rice')!;
    expect(rice).toMatchObject({ unit: 'plate', qty: 1.5, grams: 375, user_edited: true });
    expect(r.source).toBe('outside');
    const home = applyAnswers(draft, qs, [], FOODS, MED, { sourceGuess: 'unknown' });
    expect(r.items[0]!.kcal).toBeGreaterThan(home.items[0]!.kcal);
  });

  it('ignores answers to unknown options and falls back to the default', () => {
    const r = applyAnswers(draft, qs, [{ question_id: 'rice:portion', option_id: 'nonsense' }], FOODS, MED, {
      sourceGuess: 'home',
    });
    expect(r.items.find((i) => i.key === 'rice')).toMatchObject({ unit: 'plate', qty: 0.5 });
  });

  it('rejects items over 2,500 kcal (sanity limit)', () => {
    const r = applyAnswers(
      [item({ key: 'h', dish: 'Huge', food_item_id: 'huge', unit: 'piece', qty: 1 })],
      [],
      [],
      FOODS,
      MED,
      { sourceGuess: 'home' },
    );
    expect(r.items).toEqual([]);
    expect(r.rejected).toEqual(['Huge']);
  });

  it('keeps macros consistent with kcal within 20%', () => {
    const r = applyAnswers(draft, qs, [{ question_id: 'meal:source', option_id: 'outside' }], FOODS, MED, {
      sourceGuess: 'home',
    });
    for (const i of r.items) {
      const fromMacros = 4 * i.protein_g + 4 * i.carbs_g + 9 * i.fat_g;
      expect(Math.abs(fromMacros - i.kcal) / i.kcal).toBeLessThan(0.2);
    }
  });
});

describe('totals', () => {
  it('sums and rounds', () => {
    expect(
      totals([
        { kcal: 100.04, kcal_low: 90, kcal_high: 110, protein_g: 5, carbs_g: 10, fat_g: 4 },
        { kcal: 50.03, kcal_low: 45, kcal_high: 55, protein_g: 1.15, carbs_g: 2, fat_g: 1 },
      ]),
    ).toEqual({ kcal: 150.1, kcal_low: 135, kcal_high: 165, protein_g: 6.2, carbs_g: 12, fat_g: 5 });
  });
});
