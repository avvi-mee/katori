import { describe, expect, it } from 'vitest';

import {
  cigarettesAvoided,
  dayMet,
  habitAdherence,
  habitStreak,
  moneySaved,
  perDay,
  recentAverage,
  smokeFreeDays,
} from '@/features/habits/math';

// Noon IST on a day, as a UTC timestamp.
const at = (day: string, value = 1) => ({ logged_at: `${day}T06:30:00Z`, value });
const SINCE = '2026-10-01T04:00:00Z';
const TODAY = '2026-10-10';

describe('perDay', () => {
  it('groups by IST day (late-evening UTC lands on the next IST day)', () => {
    const m = perDay([at('2026-10-01', 2), { logged_at: '2026-10-01T20:00:00Z', value: 3 }]);
    expect(m.get('2026-10-01')).toBe(2);
    expect(m.get('2026-10-02')).toBe(3);
  });
});

describe('smoking', () => {
  it('counts smoke-free days since the last cigarette', () => {
    expect(smokeFreeDays([at('2026-10-05', 3)], SINCE, TODAY)).toBe(4); // 6,7,8,9 clean
    expect(smokeFreeDays([], SINCE, TODAY)).toBe(9);
    expect(smokeFreeDays([at(TODAY)], SINCE, TODAY)).toBe(0);
  });

  it('counts cigarettes avoided against the baseline, never negative per day', () => {
    // 9 completed days × 10 baseline = 90; day 5 smoked 4 (−4), day 6 smoked 15 (−10 capped). Today isn't over yet.
    const logs = [at('2026-10-05', 4), at('2026-10-06', 15)];
    expect(cigarettesAvoided(logs, 10, SINCE, TODAY)).toBe(76);
    expect(cigarettesAvoided([], 10, SINCE, '2026-10-01')).toBe(0);
    expect(cigarettesAvoided(logs, 0, SINCE, TODAY)).toBe(0);
  });

  it('turns avoided cigarettes into rupees', () => {
    expect(moneySaved(76, 18)).toBe(1368);
    expect(moneySaved(76, null)).toBe(0);
  });
});

describe('streaks', () => {
  it('goal habits need a log that meets the target', () => {
    const logs = [at('2026-10-07', 3000), at('2026-10-08', 2500), at('2026-10-09', 3000)];
    expect(habitStreak('water', logs, 2500, SINCE, TODAY)).toBe(3); // today not met yet: ends yesterday
    expect(habitStreak('water', [...logs, at(TODAY, 2600)], 2500, SINCE, TODAY)).toBe(4);
    expect(habitStreak('water', [at('2026-10-09', 1000)], 2500, SINCE, TODAY)).toBe(0);
  });

  it('limit habits count unlogged days as met, but only since tracking began', () => {
    expect(habitStreak('junk', [], 0, SINCE, TODAY)).toBe(10);
    expect(habitStreak('junk', [at('2026-10-08', 1)], 0, SINCE, TODAY)).toBe(2); // 9, 10
    expect(habitStreak('alcohol', [at('2026-10-08', 2)], 2, SINCE, TODAY)).toBe(10);
  });

  it('judges a day', () => {
    expect(dayMet('smoking', 0, null)).toBe(true);
    expect(dayMet('smoking', 1, null)).toBe(false);
    expect(dayMet('sleep', 7, 7)).toBe(true);
    expect(dayMet('custom', 1, null)).toBe(true);
  });
});

describe('averages and adherence', () => {
  it('averages logged days only', () => {
    expect(recentAverage([at('2026-10-09', 7), at('2026-10-08', 6)], TODAY)).toBe(6.5);
    expect(recentAverage([at('2026-09-01', 7)], TODAY)).toBeNull();
  });

  it('scores limits and goals', () => {
    expect(habitAdherence('smoking', 0, 0)).toBe(1);
    expect(habitAdherence('smoking', 1, 0)).toBe(0.5);
    expect(habitAdherence('smoking', 5, 0)).toBe(0);
    expect(habitAdherence('alcohol', 3, 2)).toBe(0.5);
    expect(habitAdherence('water', 1500, 3000)).toBe(0.5);
    expect(habitAdherence('water', 4000, 3000)).toBe(1);
  });
});
