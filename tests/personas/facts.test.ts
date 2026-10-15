import { describe, expect, it } from 'vitest';

import { buildFacts, groupByDay, istHour, lowDaysBefore } from '@/features/personas/facts';

describe('istHour', () => {
  it('converts UTC to IST hours', () => {
    expect(istHour(new Date('2026-10-15T15:30:00Z'))).toBe(21);
    expect(istHour(new Date('2026-10-15T18:29:00Z'))).toBe(23);
    expect(istHour(new Date('2026-10-15T18:30:00Z'))).toBe(0);
  });
});

describe('groupByDay + lowDaysBefore', () => {
  const rows = [
    { eaten_at: '2026-10-13T06:00:00Z', kcal: 600, protein_g: 20 }, // Oct 13 IST: 600 (low)
    { eaten_at: '2026-10-14T06:00:00Z', kcal: 500, protein_g: 20 }, // Oct 14 IST: 500 + 400 = 900 (low)
    { eaten_at: '2026-10-14T14:00:00Z', kcal: 400, protein_g: 10 },
    { eaten_at: '2026-10-14T19:00:00Z', kcal: 300, protein_g: 10 }, // 00:30 IST Oct 15
  ];
  const totals = groupByDay(rows);

  it('groups by IST calendar day', () => {
    expect(totals.get('2026-10-14')).toEqual({ kcal: 900, protein_g: 30, meals: 2 });
    expect(totals.get('2026-10-15')).toEqual({ kcal: 300, protein_g: 10, meals: 1 });
  });

  it('counts consecutive low logged days, capped at 2', () => {
    expect(lowDaysBefore(totals, '2026-10-15', 1200)).toBe(2);
    // yesterday (900) is fine against an 800 floor, so the run is 0
    expect(lowDaysBefore(totals, '2026-10-15', 800)).toBe(0);
    // from Oct 14: Oct 13 (600) is below 700, Oct 12 has no logs → run of 1
    expect(lowDaysBefore(totals, '2026-10-14', 700)).toBe(1);
  });

  it('a day with no logs breaks the run', () => {
    expect(lowDaysBefore(totals, '2026-10-17', 1200)).toBe(0);
  });

  it('builds facts for today with defaults for missing targets', () => {
    const f = buildFacts(
      { kcal_target: null, protein_target: 110, kcal_floor: 1200, diet_type: 'egg' },
      'daily_digest',
      new Date('2026-10-15T15:30:00Z'),
      totals,
    );
    expect(f).toMatchObject({
      hour: 21,
      kcal: 300,
      meals: 1,
      kcal_target: 2000,
      protein_target: 110,
      low_days_before: 2,
    });
  });
});
