import { describe, expect, it } from 'vitest';

import { buildCoachMessage, chooseText, pickFix, rewritePrompt, situationFor } from '@/features/personas/coach';
import { PERSONAS, type PersonaId } from '@/features/personas/personas';
import {
  checkCoachText,
  decideTone,
  isLowIntake,
  type CoachFacts,
  type CoachProfile,
} from '@/features/personas/safety';
import { SAVAGE, TEMPLATES, type Situation } from '@/features/personas/templates';

const base: CoachFacts = {
  trigger: 'meal_saved',
  hour: 17,
  kcal: 1100,
  protein_g: 40,
  meals: 3,
  kcal_target: 2000,
  protein_target: 120,
  kcal_floor: 1400,
  low_days_before: 0,
  diet_type: 'veg',
};
const profile = (persona: PersonaId, extra: Partial<CoachProfile> = {}): CoachProfile => ({
  persona,
  savage_mode: false,
  adult_confirmed: false,
  ...extra,
});

describe('safety: gentle mode on low intake', () => {
  it('turns gentle when far below the floor in the evening', () => {
    expect(isLowIntake({ ...base, hour: 20, kcal: 700 })).toBe(true);
  });
  it('does not judge a low total in the middle of the day', () => {
    expect(isLowIntake({ ...base, hour: 13, kcal: 300 })).toBe(false);
  });
  it('turns gentle at the daily digest whenever the day ended under the floor', () => {
    expect(isLowIntake({ ...base, trigger: 'daily_digest', hour: 21, kcal: 1300 })).toBe(true);
  });
  it('turns gentle after three low days in a row', () => {
    expect(isLowIntake({ ...base, hour: 19, kcal: 1300, low_days_before: 2 })).toBe(true);
    expect(isLowIntake({ ...base, hour: 19, kcal: 1300, low_days_before: 1 })).toBe(false);
  });
  it('never assumes starvation when nothing was logged', () => {
    expect(isLowIntake({ ...base, trigger: 'daily_digest', kcal: 0, meals: 0 })).toBe(false);
  });
  it('gentle overrides every persona, including Savage mode', () => {
    const low = { ...base, hour: 21, kcal: 500 };
    for (const p of PERSONAS)
      expect(decideTone(low, profile(p, { savage_mode: true, adult_confirmed: true }))).toBe('gentle');
    expect(buildCoachMessage(low, profile('gym_bro', { savage_mode: true, adult_confirmed: true })).situation).toBe(
      'gentle',
    );
  });
});

describe('safety: Savage mode', () => {
  it('needs the 18+ confirmation and only applies to Gym Bro', () => {
    expect(decideTone(base, profile('gym_bro', { savage_mode: true, adult_confirmed: false }))).toBe('normal');
    expect(decideTone(base, profile('gym_bro', { savage_mode: true, adult_confirmed: true }))).toBe('savage');
    expect(decideTone(base, profile('desi_mummy', { savage_mode: true, adult_confirmed: true }))).toBe('normal');
  });
});

describe('templates', () => {
  const facts: Record<Situation, CoachFacts> = {
    on_track: { ...base, hour: 12, kcal: 900, protein_g: 70 },
    protein_short: base,
    over: { ...base, kcal: 2500 },
    great_day: { ...base, trigger: 'daily_digest', hour: 21, kcal: 2000, protein_g: 115 },
    okay_day: { ...base, trigger: 'daily_digest', hour: 21, kcal: 1700, protein_g: 70 },
    no_logs: { ...base, trigger: 'daily_digest', hour: 21, kcal: 0, protein_g: 0, meals: 0 },
    gentle: { ...base, hour: 21, kcal: 600 },
  };

  it('every line of every persona passes the safety checker with its own numbers', () => {
    for (const persona of PERSONAS) {
      for (const situation of Object.keys(facts) as Situation[]) {
        for (let seed = 0; seed < 3; seed++) {
          const m = buildCoachMessage(facts[situation], profile(persona), seed);
          expect(m.situation, `${persona}/${situation}`).toBe(situation);
          expect(m.text).not.toMatch(/\{\w+\}/);
          expect(checkCoachText(m.text, m.numbers), `${persona}/${situation}: ${m.text}`).toEqual({ ok: true });
        }
      }
    }
  });

  it('savage lines pass the checker too (attitude, no abuse)', () => {
    for (const situation of Object.keys(SAVAGE) as Situation[]) {
      const m = buildCoachMessage(facts[situation], profile('gym_bro', { savage_mode: true, adult_confirmed: true }));
      expect(m.tone).toBe('savage');
      expect(checkCoachText(m.text, m.numbers), m.text).toEqual({ ok: true });
    }
  });

  it('covers every situation for every persona', () => {
    for (const p of PERSONAS)
      for (const s of Object.keys(facts) as Situation[]) expect(TEMPLATES[p][s].length).toBeGreaterThan(0);
  });

  it('gives the protein gap and a diet-appropriate fix', () => {
    const m = buildCoachMessage(base, profile('strict_coach'), 0);
    expect(m.text).toContain('80 g');
    expect(m.text).toContain('paneer');
  });
});

describe('situationFor', () => {
  it('flags protein short only later in the day', () => {
    expect(situationFor({ ...base, hour: 10 }, 'normal')).toBe('on_track');
    expect(situationFor({ ...base, hour: 16 }, 'normal')).toBe('protein_short');
  });
});

describe('pickFix', () => {
  it('respects diet type', () => {
    expect(pickFix(40, 'nonveg').text).toMatch(/chicken/);
    expect(pickFix(40, 'veg').text).not.toMatch(/chicken|egg/);
    expect(pickFix(10, 'jain').text).not.toMatch(/soya|egg|chicken/);
    expect(pickFix(18, 'egg').text).toMatch(/eggs/);
  });
});

describe('checkCoachText (AI output guard)', () => {
  const nums = [80, 900, 2000];
  it('rejects body/weight/looks talk in English and Hinglish', () => {
    expect(checkCoachText('You will lose weight fast!', nums).ok).toBe(false);
    expect(checkCoachText('Bhai tond nikal rahi hai', nums).ok).toBe(false);
    expect(checkCoachText('Looking slim already', nums).ok).toBe(false);
  });
  it('allows "fat" as a macro after a number', () => {
    expect(checkCoachText('Dinner: 80 g protein, 2000 g fat is too much', nums).ok).toBe(true);
  });
  it('rejects praise for skipping meals', () => {
    expect(checkCoachText('Great job skipping lunch!', nums).ok).toBe(false);
  });
  it('rejects abuse even in savage mode', () => {
    expect(checkCoachText('Kya kar raha hai chutiye', nums).ok).toBe(false);
  });
  it('rejects numbers the facts do not contain', () => {
    expect(checkCoachText('You need 95 g protein', nums)).toEqual({ ok: false, reason: 'number 95' });
    expect(checkCoachText('You need 80 g protein in 2 meals', nums).ok).toBe(true);
  });
  it('chooseText falls back to the template when the AI breaks a rule', () => {
    const m = buildCoachMessage(base, profile('hype_friend'));
    expect(chooseText(m, 'Skip dinner and you will look great!')).toEqual({ text: m.text, usedAi: false });
    expect(chooseText(m, null).usedAi).toBe(false);
    expect(chooseText(m, '"80 g protein to go, you got this!"')).toEqual({
      text: '80 g protein to go, you got this!',
      usedAi: true,
    });
  });
  it('the rewrite prompt carries the rules', () => {
    const p = rewritePrompt(buildCoachMessage({ ...base, hour: 21, kcal: 500 }, profile('desi_mummy')));
    expect(p.system).toMatch(/never mention body shape, weight or looks/);
    expect(p.system).toMatch(/gentle/);
  });
});
