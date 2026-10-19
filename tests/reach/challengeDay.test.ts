import { describe, expect, it } from 'vitest';

import { challengeDay } from '@/features/reach/api';

describe('challengeDay', () => {
  const c = { starts_on: '2026-10-20', ends_on: '2026-11-18' };
  it('counts day n of 30', () => {
    expect(challengeDay(c, '2026-10-20')).toEqual({ day: 1, upcoming: false, over: false });
    expect(challengeDay(c, '2026-11-18')).toEqual({ day: 30, upcoming: false, over: false });
  });
  it('handles before and after', () => {
    expect(challengeDay(c, '2026-10-18')).toEqual({ day: 0, upcoming: true, over: false });
    expect(challengeDay(c, '2026-11-25')).toEqual({ day: 30, upcoming: false, over: true });
  });
});
