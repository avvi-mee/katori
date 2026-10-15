import { describe, expect, it } from 'vitest';

import { addDays, istDay, istDayRange } from '@/lib/day';

describe('IST days', () => {
  it('rolls over at midnight IST, not UTC', () => {
    expect(istDay(new Date('2026-10-15T18:29:00.000Z'))).toBe('2026-10-15');
    expect(istDay(new Date('2026-10-15T18:30:00.000Z'))).toBe('2026-10-16');
  });
  it('gives UTC bounds for an IST day', () => {
    expect(istDayRange('2026-10-16')).toEqual({ from: '2026-10-15T18:30:00.000Z', to: '2026-10-16T18:30:00.000Z' });
  });
  it('adds days across months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
