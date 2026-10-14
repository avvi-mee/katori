import { describe, expect, it } from 'vitest';

import { parseSeed } from '../scripts/build-seed.mjs';

type Row = {
  slug: string;
  name: string;
  kind: string;
  units: Record<string, string | number>;
  density_g_per_ml: number | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  default_oil_g: number;
  unitsValid: boolean;
};
const rows = parseSeed() as Row[];

describe('food_items seed', () => {
  it('has at least 300 Indian dishes', () => {
    expect(rows.filter((r) => r.kind === 'dish').length).toBeGreaterThanOrEqual(300);
  });

  it('has unique slugs', () => {
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });

  it.each(rows.map((r) => [r.slug, r] as const))('%s is plausible', (_slug, r) => {
    expect(r.unitsValid).toBe(true);
    for (const v of [r.protein_100g, r.carbs_100g, r.fat_100g]) expect(Number.isFinite(v) && v >= 0).toBe(true);
    // macros can't exceed the food's own weight; kcal must be within physical limits
    expect(r.protein_100g + r.carbs_100g + r.fat_100g).toBeLessThanOrEqual(100.5);
    expect(r.kcal_100g).toBeLessThanOrEqual(900);
    // macros add up to kcal within 20% (the doc's sanity rule)
    const fromMacros = 4 * r.protein_100g + 4 * r.carbs_100g + 9 * r.fat_100g;
    if (r.kcal_100g > 0) expect(Math.abs(fromMacros - r.kcal_100g) / r.kcal_100g).toBeLessThanOrEqual(0.2);
    // included oil can't exceed total fat
    expect(r.default_oil_g).toBeLessThanOrEqual(r.fat_100g + 0.01);
    // every unit must be convertible to grams
    const def = r.units.default as string;
    if (def === 'katori') expect(r.density_g_per_ml).toBeGreaterThan(0);
    if (['roti', 'piece', 'plate', 'scoop'].includes(def)) expect(r.units[def]).toBeGreaterThan(0);
    if (['glass', 'tbsp'].includes(def)) expect(Number(r.units[def]) > 0 || Number(r.density_g_per_ml) > 0).toBe(true);
    if (def === 'plate') expect(r.units.scoop).toBeGreaterThan(0);
  });
});
