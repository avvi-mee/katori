// server-shared: one nutrition engine, four voices. Facts and advice are computed first; the persona
// only changes the wording.
import { personaMeta } from './personas.ts';
import { checkCoachText, decideTone, type CoachFacts, type CoachProfile, type DietType, type Tone } from './safety.ts';
import { SAVAGE, TEMPLATES, type Situation } from './templates.ts';

type Fix = { text: string; protein: number };

const VEG_FIXES: Fix[] = [
  { text: '1 katori dal + 1 katori dahi', protein: 14 },
  { text: '1 katori soya chunks curry', protein: 16 },
  { text: '150 g paneer bhurji', protein: 27 },
];
const FIXES: Record<DietType, Fix[]> = {
  veg: VEG_FIXES,
  jain: [
    { text: '1 katori moong dal + 1 katori dahi', protein: 13 },
    { text: '150 g paneer', protein: 27 },
  ],
  egg: [...VEG_FIXES, { text: '3 boiled eggs', protein: 19 }],
  nonveg: [...VEG_FIXES, { text: '3 boiled eggs', protein: 19 }, { text: '150 g grilled chicken', protein: 45 }],
};

/** Smallest fix that covers the protein gap, else the biggest one. */
export function pickFix(gap: number, diet: DietType | null): Fix {
  const options = [...FIXES[diet ?? 'veg']].sort((a, b) => a.protein - b.protein);
  return options.find((f) => f.protein >= gap) ?? options[options.length - 1]!;
}

export function situationFor(f: CoachFacts, tone: Tone): Situation {
  if (tone === 'gentle') return 'gentle';
  const over = f.kcal > f.kcal_target * 1.1;
  if (f.trigger === 'daily_digest') {
    if (f.meals === 0) return 'no_logs';
    if (over) return 'over';
    if (Math.abs(f.kcal - f.kcal_target) <= f.kcal_target * 0.1 && f.protein_g >= f.protein_target * 0.9)
      return 'great_day';
    return 'okay_day';
  }
  if (over) return 'over';
  if (f.hour >= 15 && f.protein_g < f.protein_target * 0.5) return 'protein_short';
  return 'on_track';
}

export type CoachMessage = {
  text: string;
  persona: CoachProfile['persona'];
  tone: Tone;
  situation: Situation;
  /** Every number the message may contain; AI rewrites are checked against this. */
  numbers: number[];
};

const fill = (line: string, vars: Record<string, string | number>) =>
  line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

/** Deterministic template message. `seed` rotates between variants (e.g. day of year). */
export function buildCoachMessage(f: CoachFacts, p: CoachProfile, seed = 0): CoachMessage {
  const tone = decideTone(f, p);
  const situation = situationFor(f, tone);
  const gap = Math.max(0, Math.round(f.protein_target - f.protein_g));
  const fix = pickFix(gap, f.diet_type);
  const vars = {
    gap,
    left: Math.max(0, Math.round(f.kcal_target - f.kcal)),
    fix: fix.text,
    kcal: Math.round(f.kcal),
    protein: Math.round(f.protein_g),
    target: Math.round(f.kcal_target),
    ptarget: Math.round(f.protein_target),
    floor: Math.round(f.kcal_floor),
  };
  const pool = (tone === 'savage' && SAVAGE[situation]) || TEMPLATES[p.persona][situation];
  const text = fill(pool[Math.abs(seed) % pool.length]!, vars);
  const numbers = [
    vars.gap,
    vars.left,
    vars.kcal,
    vars.protein,
    vars.target,
    vars.ptarget,
    vars.floor,
    ...(fix.text.match(/\d+/g) ?? []).map(Number),
    30,
  ];
  return { text, persona: p.persona, tone, situation, numbers };
}

/** Prompt for the Pro AI rewrite. The model rewrites wording only; checkCoachText guards the result. */
export function rewritePrompt(m: CoachMessage): { system: string; user: string } {
  const meta = personaMeta[m.persona];
  const toneRule =
    m.tone === 'gentle'
      ? 'Be gentle and caring. Encourage eating a proper meal now. No teasing.'
      : m.tone === 'savage'
        ? 'Savage mode: confident attitude and teasing about the food choice only. Never abusive, no gaalis.'
        : 'Keep it warm and motivating.';
  return {
    system: `You are ${meta.name}, a fitness coach persona in an Indian food-tracking app. Voice: ${meta.voice}.
Rewrite the coach message you are given in your own voice, in 1-2 short sentences (under 220 characters).
Rules: keep every number exactly as given and add no new numbers; never mention body shape, weight or looks — talk about food only; never praise skipping meals or eating less; ${toneRule}
Reply with the message text only.`,
    user: `Message: ${m.text}`,
  };
}

/** Use the AI text only if it passes every safety check; otherwise keep the template. */
export function chooseText(m: CoachMessage, aiText: string | null): { text: string; usedAi: boolean } {
  if (!aiText) return { text: m.text, usedAi: false };
  const cleaned = aiText.trim().replace(/^["“]|["”]$/g, '');
  return checkCoachText(cleaned, m.numbers).ok ? { text: cleaned, usedAi: true } : { text: m.text, usedAi: false };
}
