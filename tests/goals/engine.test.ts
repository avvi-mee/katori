import { describe, expect, it } from 'vitest';

import {
  dailyScore,
  dailyTargets,
  engineMayAdjust,
  isRecalcDay,
  kcalAdherence,
  trainingWeekdays,
  weeklyRecalc,
  weightSlopePerDay,
  type ScoreInputs,
} from '@/features/goals/engine';
import { addDays } from '@/lib/day';

const profile = { kcal_target: 2000, protein_target: 120, weight_kg: 70 };
const targets = dailyTargets(profile, null, 4);

describe('dailyTargets', () => {
  it('falls back to the profile and defaults', () => {
    expect(targets).toEqual({
      kcal: 2000,
      protein_g: 120,
      steps: 8000,
      water_ml: 2500, // 70 × 35 = 2450 → nearest 250
      sleep_h: 7.5,
      workouts_per_week: 4,
      smoking_limit: null,
    });
  });
  it('lets the goals row win', () => {
    expect(dailyTargets(profile, { kcal: 1800, steps: 10000 }, 3)).toMatchObject({ kcal: 1800, steps: 10000 });
  });
});

describe('trainingWeekdays', () => {
  it('uses picked days, else spreads them out', () => {
    expect(trainingWeekdays({ training_days: 3, training_weekdays: [2, 4] })).toEqual([2, 4]);
    expect(trainingWeekdays({ training_days: 3, training_weekdays: [] })).toEqual([1, 3, 5]);
    expect(trainingWeekdays({ training_days: 9, training_weekdays: [] })).toEqual([1, 3, 5]);
  });
});

describe('kcalAdherence', () => {
  it('gives full credit within ±10 % and none past ±50 %', () => {
    expect(kcalAdherence(2150, 2000)).toBe(1);
    expect(kcalAdherence(1700, 2000)).toBeCloseTo(0.875);
    expect(kcalAdherence(3000, 2000)).toBe(0);
    expect(kcalAdherence(500, 0)).toBe(0);
  });
});

const base: ScoreInputs = {
  targets,
  food: { kcal: 2000, protein_g: 120, meals: 3 },
  trainingDay: true,
  workoutsDone: 1,
  steps: 8000,
  habits: [{ name: 'water', adherence: 1 }],
};

describe('dailyScore', () => {
  it('scores a perfect day 100 with nothing to move', () => {
    const s = dailyScore(base);
    expect(s.score).toBe(100);
    expect(s.movedBy).toEqual([]);
    expect(s.parts.map((p) => p.weight)).toEqual([40, 25, 15, 20]);
  });

  it('redistributes training weight on a rest day', () => {
    const s = dailyScore({ ...base, trainingDay: false, workoutsDone: 0 });
    expect(s.score).toBe(100);
    expect(s.parts.map((p) => p.key)).toEqual(['food', 'activity', 'habits']);
    expect(s.parts[0]!.weight).toBeCloseTo(40 / 0.75);
  });

  it('counts a workout on a rest day as training', () => {
    expect(dailyScore({ ...base, trainingDay: false }).parts.map((p) => p.key)).toContain('training');
  });

  it('redistributes habits weight when none are tracked', () => {
    const s = dailyScore({ ...base, habits: [] });
    expect(s.parts.reduce((a, p) => a + p.weight, 0)).toBeCloseTo(100);
    expect(s.score).toBe(100);
  });

  it('says what moved it, biggest gap first', () => {
    const s = dailyScore({ ...base, workoutsDone: 0, steps: 4000 });
    expect(s.score).toBe(68); // 100 − 25 − 7.5 → 67.5
    expect(s.movedBy[0]).toMatch(/^training: training day, no workout yet \(−25\)/);
    expect(s.movedBy[1]).toMatch(/^activity: 4,000 \/ 8,000 steps/);
  });

  it('gives no food credit without meals', () => {
    const s = dailyScore({ ...base, food: { kcal: 0, protein_g: 0, meals: 0 } });
    expect(s.score).toBe(60);
    expect(s.movedBy[0]).toContain('no meals logged');
  });
});

describe('weekly recalculation', () => {
  const days = (n: number, kcal: number) =>
    Array.from({ length: n }, (_, k) => ({ date: addDays('2026-10-01', k), kcal }));
  const trend = (n: number, start: number, perDay: number) =>
    Array.from({ length: n }, (_, k) => ({ date: addDays('2026-10-01', k), weight_kg: start + perDay * k }));

  it('fits a weight slope', () => {
    expect(weightSlopePerDay(trend(10, 80, -0.1))).toBeCloseTo(-0.1);
    expect(weightSlopePerDay([{ date: '2026-10-01', weight_kg: 80 }])).toBeNull();
  });

  it('needs enough data', () => {
    const o = { goal: 'fat_loss', currentKcal: 2000, floor: 1500 };
    expect(weeklyRecalc({ ...o, intake: days(9, 2000), weights: trend(14, 80, 0) })).toBeNull();
    expect(weeklyRecalc({ ...o, intake: days(14, 2000), weights: trend(5, 80, 0) })).toBeNull();
  });

  it('lowers the target when fat loss stalls, capped at 10 %', () => {
    // Weight flat on 2,200 → TDEE 2,200; −0.5 %/wk of 80 kg ≈ −440 kcal/day → ideal 1,760; cap → 1,980.
    const r = weeklyRecalc({
      goal: 'fat_loss',
      currentKcal: 2200,
      floor: 1500,
      intake: days(14, 2200),
      weights: trend(14, 80, 0),
    });
    expect(r?.kcal).toBe(1980);
    expect(r?.estimatedTdee).toBe(2200);
    expect(r?.reason).toContain('+0.00 kg/week');
  });

  it('never goes below the floor', () => {
    const r = weeklyRecalc({
      goal: 'fat_loss',
      currentKcal: 1600,
      floor: 1550,
      intake: days(14, 1600),
      weights: trend(14, 80, 0.05),
    });
    expect(r?.kcal).toBe(1550);
  });

  it('leaves small changes alone', () => {
    // Losing 0.4 kg/week on 2,000 → TDEE 2,440; ideal 2,440 − 440 = 2,000 → no change.
    const r = weeklyRecalc({
      goal: 'fat_loss',
      currentKcal: 2000,
      floor: 1500,
      intake: days(14, 2000),
      weights: trend(14, 80, -0.4 / 7),
    });
    expect(r).toBeNull();
  });
});

describe('recalculation guards', () => {
  it('respects a calorie target the user set', () => {
    expect(engineMayAdjust(null)).toBe(true);
    expect(engineMayAdjust({ kcal: null, updated_by: 'user' })).toBe(true);
    expect(engineMayAdjust({ kcal: 1900, updated_by: 'engine' })).toBe(true);
    expect(engineMayAdjust({ kcal: 1900, updated_by: 'user' })).toBe(false);
  });
  it('runs on Mondays', () => {
    expect(isRecalcDay('2026-10-19')).toBe(true);
    expect(isRecalcDay('2026-10-20')).toBe(false);
  });
});
