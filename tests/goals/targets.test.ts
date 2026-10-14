import { describe, expect, it } from 'vitest';

import { computeTargets } from '@/features/goals/targets';

describe('computeTargets', () => {
  it('matches a hand-computed Mifflin-St Jeor example', () => {
    // 30 y male, 75 kg, 175 cm: BMR = 750 + 1093.75 - 150 + 5 = 1698.75; ×1.55 = 2633; −20% = 2106
    const t = computeTargets({
      sex: 'male',
      birthYear: 1996,
      heightCm: 175,
      weightKg: 75,
      activity: 'moderate',
      goal: 'fat_loss',
      year: 2026,
    });
    expect(t.bmr).toBe(1699);
    expect(t.tdee).toBe(2633);
    expect(t.kcal).toBe(2110);
    expect(t.protein).toBe(150);
    expect(t.floor).toBe(1530);
  });

  it('adds a surplus for muscle gain', () => {
    const t = computeTargets({
      sex: 'male',
      birthYear: 2000,
      heightCm: 170,
      weightKg: 65,
      activity: 'active',
      goal: 'muscle_gain',
      year: 2026,
    });
    // BMR = 650 + 1062.5 - 130 + 5 = 1587.5; ×1.725 = 2738; +10% = 3012
    expect(t.kcal).toBe(3010);
    expect(t.protein).toBe(115); // 65 × 1.8 = 117 → nearest 5
  });

  it('never sets a target below the safe calorie floor', () => {
    const t = computeTargets({
      sex: 'female',
      birthYear: 2001,
      heightCm: 152,
      weightKg: 45,
      activity: 'sedentary',
      goal: 'fat_loss',
      year: 2026,
    });
    // BMR = 450 + 950 - 125 - 161 = 1114; ×1.2 = 1337; −20% = 1070 → clamped to 1200
    expect(t.floor).toBe(1200);
    expect(t.kcal).toBe(1200);
  });

  it('caps protein for very heavy users', () => {
    const t = computeTargets({
      sex: 'male',
      birthYear: 1990,
      heightCm: 185,
      weightKg: 140,
      activity: 'light',
      goal: 'fat_loss',
      year: 2026,
    });
    expect(t.protein).toBe(220);
  });

  it('uses the average offset for sex = other', () => {
    const base = {
      birthYear: 1996,
      heightCm: 170,
      weightKg: 70,
      activity: 'moderate' as const,
      goal: 'recomposition' as const,
      year: 2026,
    };
    const m = computeTargets({ ...base, sex: 'male' }).bmr;
    const f = computeTargets({ ...base, sex: 'female' }).bmr;
    const o = computeTargets({ ...base, sex: 'other' }).bmr;
    expect(o).toBeGreaterThan(f);
    expect(o).toBeLessThan(m);
  });
});
