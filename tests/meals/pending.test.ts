import { describe, expect, it } from 'vitest';

import { buildPending } from '@/features/meals/pending';
import type { Food } from '@/features/portions/engine';
import type { DraftResponse } from '@/types/api';

const DAL: Food = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Dal Tadka',
  units: { default: 'katori' },
  density_g_per_ml: 1.03,
  kcal_100g: 120.5,
  protein_100g: 6,
  carbs_100g: 14,
  fat_100g: 4.5,
  default_oil_g: 4,
};
const ctx = { katori_ml: 150, plate_size: 'medium' as const };

describe('buildPending', () => {
  it('previews a manual meal with the shared engine', () => {
    const p = buildPending(
      {
        client_id: 'c1',
        meal_type: 'lunch',
        source: 'home',
        items: [{ food_item_id: DAL.id, unit: 'katori', qty: 1, oil_level: 'normal' }],
        eaten_at: '2026-10-15T07:00:00.000Z',
      },
      { foods: [DAL], ctx, draft: null, draftMealType: 'lunch' },
    )!;
    expect(p.client_id).toBe('c1');
    expect(p.eaten_at).toBe('2026-10-15T07:00:00.000Z');
    expect(p.totals.kcal).toBeCloseTo(186.2, 1);
    expect(p.items[0]).toMatchObject({ dish: 'Dal Tadka', grams: 154.5 });
  });

  it('previews a scan draft with the user’s answers', () => {
    const draft: DraftResponse = {
      draft_id: 'd1',
      source_guess: 'unknown',
      unmatched: [],
      items: [
        { key: 'dal', dish: 'Dal Tadka', food_item_id: DAL.id, unit: 'katori', qty: 1, confidence: 0.6, cooked: true },
      ],
      questions: [
        {
          id: 'dal:portion',
          item_key: 'dal',
          kind: 'portion',
          prompt: 'Dal kitni thi?',
          options: [
            { id: 'one', label: '1', value: 1 },
            { id: 'two', label: '2', value: 2 },
          ],
          default_option: 'one',
        },
      ],
    };
    const p = buildPending(
      { client_id: 'c2', draft_id: 'd1', answers: [{ question_id: 'dal:portion', option_id: 'two' }] },
      { foods: [DAL], ctx, draft, draftMealType: 'dinner' },
    )!;
    expect(p.meal_type).toBe('dinner');
    expect(p.items[0]?.qty).toBe(2);
  });

  it('returns null when it cannot compute anything locally', () => {
    expect(
      buildPending(
        { client_id: 'c3', draft_id: 'other', answers: [] },
        { foods: [DAL], ctx, draft: null, draftMealType: 'lunch' },
      ),
    ).toBeNull();
    expect(
      buildPending(
        {
          client_id: 'c4',
          meal_type: 'lunch',
          source: 'home',
          items: [{ food_item_id: 'unknown', unit: 'g', qty: 100 }],
        },
        { foods: [DAL], ctx, draft: null, draftMealType: 'lunch' },
      ),
    ).toBeNull();
  });
});
