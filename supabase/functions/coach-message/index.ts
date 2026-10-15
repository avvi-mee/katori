// coach-message (internal): { trigger, facts, persona } → { text }. Safety rules are applied in code, then
// the facts are written in the persona's voice — templates first, AI only when asked (Pro callers).
// Used by internal channels (Telegram in Phase 3); confirm-meal and daily-digest call the shared helper directly.
import { z } from 'npm:zod@4.6.7';

import { generateText, providerFromEnv } from '../_shared/ai.ts';
import { buildCoachMessage, chooseText, rewritePrompt } from '../_shared/gen/features/personas/coach.ts';
import { PERSONAS } from '../_shared/gen/features/personas/personas.ts';
import { fail, json, readBody, serve } from '../_shared/http.ts';

const Body = z.object({
  trigger: z.enum(['meal_saved', 'daily_digest']),
  persona: z.enum(PERSONAS),
  savage_mode: z.boolean().default(false),
  adult_confirmed: z.boolean().default(false),
  ai: z.boolean().default(false),
  facts: z.object({
    hour: z.number().int().min(0).max(23),
    kcal: z.number().min(0),
    protein_g: z.number().min(0),
    meals: z.number().int().min(0),
    kcal_target: z.number().positive(),
    protein_target: z.number().positive(),
    kcal_floor: z.number().positive(),
    low_days_before: z.number().int().min(0).default(0),
    diet_type: z.enum(['veg', 'egg', 'nonveg', 'jain']).nullable().default(null),
  }),
});

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) fail('UNAUTHENTICATED', 'internal only');
  const b = await readBody(req, Body);
  const m = buildCoachMessage({ ...b.facts, trigger: b.trigger }, b);
  let aiText: string | null = null;
  if (b.ai) {
    try {
      aiText = (await generateText(providerFromEnv(), rewritePrompt(m))).text;
    } catch {
      aiText = null;
    }
  }
  const { text, usedAi } = chooseText(m, aiText);
  return json({ text, tone: m.tone, situation: m.situation, ai: usedAi });
});
