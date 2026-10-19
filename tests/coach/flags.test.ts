import { describe, expect, it } from 'vitest';

import { adherentDays, plannedSoFar, redFlags, weekStart } from '@/features/coach/flags';

const TODAY = '2026-10-22'; // Thursday
const base = {
  today: TODAY,
  lastLogDay: TODAY,
  kcalTarget: 2000,
  proteinTarget: 120,
  planWeekdays: [] as number[],
  workoutsThisWeek: 0,
};
const days = (entries: [string, number, number][]) =>
  new Map(entries.map(([d, kcal, p]) => [d, { kcal, protein_g: p }]));

describe('weeks and plans', () => {
  it('finds Monday and counts planned days so far', () => {
    expect(weekStart(TODAY)).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday belongs to the same week
    expect(plannedSoFar([1, 3, 5], TODAY)).toBe(2); // Mon, Wed
    expect(plannedSoFar([1, 3, 5], '2026-10-24')).toBe(3);
  });
});

describe('redFlags', () => {
  it('is quiet for a client on track', () => {
    expect(redFlags({ ...base, byDay: days([['2026-10-21', 2000, 130]]) })).toEqual([]);
  });

  it('flags no logs for 2+ days, or never', () => {
    expect(redFlags({ ...base, byDay: new Map(), lastLogDay: '2026-10-20' })).toEqual([{ key: 'no_logs', n: 2 }]);
    expect(redFlags({ ...base, byDay: new Map(), lastLogDay: null })[0]).toEqual({ key: 'no_logs', n: 0 });
  });

  it('flags protein short 3 days in a row (ending yesterday)', () => {
    const byDay = days([
      ['2026-10-19', 1900, 60],
      ['2026-10-20', 1900, 70],
      ['2026-10-21', 1900, 80],
    ]);
    expect(redFlags({ ...base, byDay })).toContainEqual({ key: 'protein_short', n: 3 });
    byDay.set('2026-10-20', { kcal: 1900, protein_g: 110 });
    expect(redFlags({ ...base, byDay }).map((f) => f.key)).not.toContain('protein_short');
  });

  it('flags missed planned sessions, but not today’s', () => {
    const f = redFlags({ ...base, byDay: new Map(), planWeekdays: [1, 3, 4], workoutsThisWeek: 1 });
    expect(f).toContainEqual({ key: 'missed_sessions', n: 1 }); // Mon + Wed planned, 1 done; Thu is today
    expect(
      redFlags({ ...base, today: '2026-10-19', lastLogDay: '2026-10-19', byDay: new Map(), planWeekdays: [1] }),
    ).toEqual([]);
  });

  it('flags calories 20% over for 3 days', () => {
    const byDay = days([
      ['2026-10-19', 2500, 130],
      ['2026-10-20', 2600, 130],
      ['2026-10-21', 2450, 130],
    ]);
    expect(redFlags({ ...base, byDay })).toContainEqual({ key: 'over_kcal', n: 3 });
  });
});

describe('adherentDays', () => {
  it('counts days within ±10% of target', () => {
    const byDay = days([
      ['a', 1850, 0],
      ['b', 2300, 0],
      ['c', 2190, 0],
    ]);
    expect(adherentDays(byDay, ['a', 'b', 'c', 'd'], 2000)).toBe(2);
  });
});
