import { describe, expect, it } from 'vitest';

import { lastNDays, proteinStreak, weekSummary, type DayStat } from '@/features/meals/streaks';
import { weeklyLine } from '@/features/personas/templates';
import { PERSONAS } from '@/features/personas/personas';
import { checkCoachText } from '@/features/personas/safety';

const stat = (protein_g: number, kcal = 1800): DayStat => ({ kcal, protein_g, meals: 3 });

describe('lastNDays', () => {
  it('returns n days ending today, oldest first', () => {
    expect(lastNDays('2026-10-02', 3)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('proteinStreak', () => {
  const byDay = new Map([
    ['2026-10-12', stat(130)],
    ['2026-10-13', stat(125)],
    ['2026-10-14', stat(121)],
    ['2026-10-15', stat(40)],
  ]);
  it('keeps yesterday’s streak alive while today is still in progress', () => {
    expect(proteinStreak(byDay, '2026-10-15', 120)).toBe(3);
  });
  it('includes today once today is hit', () => {
    byDay.set('2026-10-15', stat(122));
    expect(proteinStreak(byDay, '2026-10-15', 120)).toBe(4);
  });
  it('breaks on a missed day', () => {
    expect(proteinStreak(byDay, '2026-10-15', 126)).toBe(0);
    expect(proteinStreak(new Map(), '2026-10-15', 100)).toBe(0);
  });
});

describe('weekSummary', () => {
  it('averages only logged days and counts protein days', () => {
    const days = lastNDays('2026-10-15', 7);
    const byDay = new Map([
      ['2026-10-15', stat(130, 2000)],
      ['2026-10-14', stat(90, 1600)],
    ]);
    expect(weekSummary(byDay, days, 120)).toEqual({
      avgKcal: 1800,
      proteinDays: [false, false, false, false, false, false, true],
      loggedDays: 2,
      hitDays: 1,
    });
  });
});

describe('weeklyLine', () => {
  it('passes the coach safety checker for every persona and case', () => {
    for (const p of PERSONAS) {
      for (const [hit, logged] of [
        [6, 7],
        [2, 6],
        [0, 1],
      ] as const) {
        const line = weeklyLine(p, hit, logged);
        expect(line).not.toMatch(/\{/);
        expect(checkCoachText(line, [hit, 7]).ok, line).toBe(true);
      }
    }
  });
});
