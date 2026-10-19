import { describe, expect, it } from 'vitest';

import { PERSONAS } from '@/features/personas/personas';
import { checkCoachText } from '@/features/personas/safety';
import { ALL_SMOKING_LINES, smokingLine, workoutLine } from '@/features/personas/trainLines';

const base = { persona: 'gym_bro' as const, savage_mode: false, adult_confirmed: false };

describe('workout lines', () => {
  it('celebrates PRs and fills numbers', () => {
    expect(workoutLine(base, { prs: 2, minutes: 52, volume: 8450 })).toBe(
      'Bhai 2 naye PR! 52 min mein 8,450 kg uthaya. Beast mode on.',
    );
  });
  it('uses Savage only with the 18+ confirmation', () => {
    const noGate = workoutLine({ ...base, savage_mode: true }, { prs: 0, minutes: 40, volume: 5000 });
    const gated = workoutLine(
      { ...base, savage_mode: true, adult_confirmed: true },
      { prs: 0, minutes: 40, volume: 5000 },
    );
    expect(noGate).toContain('Workout done bhai');
    expect(gated).toContain('less phone');
  });
});

describe('smoking lines', () => {
  const f = { smokeFreeDays: 0, today: 0, baseline: 10, avoided: 0, saved: 0 };

  it('picks the right supportive line', () => {
    expect(smokingLine('strict_coach', { ...f, smokeFreeDays: 5, avoided: 50, saved: 900 })).toBe(
      '5 smoke-free days. 50 cigarettes avoided, ₹900 saved. Keep the streak.',
    );
    expect(smokingLine('hype_friend', f)).toContain('Zero so far');
    expect(smokingLine('desi_mummy', { ...f, today: 4 })).toContain('kam ho rahi');
    expect(smokingLine('gym_bro', { ...f, today: 12 })).toContain('ek slip se kuch khatam nahi');
  });

  it('every persona has every situation and no line shames or comments on the body', () => {
    expect(ALL_SMOKING_LINES).toHaveLength(PERSONAS.length * 4);
    for (const line of ALL_SMOKING_LINES) {
      expect(line).not.toMatch(/shame|disgust|pathetic|weak|loser|sharam|fat|mota|belly/i);
      const filled = line.replace(/\{\w+\}/g, '1');
      expect(checkCoachText(filled, [1, 5, 10]).ok, line).toBe(true);
    }
  });
});
