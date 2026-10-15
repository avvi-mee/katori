// server-shared: the AI prompt contract from docs/ARCHITECTURE.md and the parser for its reply.
// The AI never calculates calories: it names dishes and portions; the server does the maths.
import { z } from 'zod';

import { Unit, type MealType } from '../../types/meal.ts';

export const SYSTEM_PROMPT = `You identify foods in a meal photo, focused on Indian and South Asian cuisine. You do NOT calculate calories; the server does that.
Return ONLY JSON, no prose:
{"items":[{"key":string,"dish":string,"unit":"katori|roti|piece|plate|scoop|glass|tbsp|g","qty":number,"cooked":boolean,"confidence":0-1}],"source_guess":"home|outside|unknown","not_food":boolean}
Rules: one item per distinct dish; use Indian home units; estimate qty for a typical home serving; cooked=true if the dish is likely made with oil or ghee; low confidence when unsure; not_food=true if there is no food.
"key" is a short lowercase id for the dish, e.g. "dal", "rice", "roti".`;

export const TEXT_SYSTEM_PROMPT = `You turn a short meal description (English or Hinglish) into food items, focused on Indian and South Asian cuisine. You do NOT calculate calories; the server does that.
Return ONLY JSON, no prose, in exactly this shape:
{"items":[{"key":string,"dish":string,"unit":"katori|roti|piece|plate|scoop|glass|tbsp|g","qty":number,"cooked":boolean,"confidence":0-1}],"source_guess":"home|outside|unknown","not_food":boolean}
Rules: one item per distinct dish; use the quantities the user wrote, otherwise a typical home serving; cooked=true if the dish is likely made with oil or ghee; confidence reflects how clearly the user stated the quantity; not_food=true if the text describes no food.`;

export function userPrompt(o: { mealType: MealType; hint?: string | null; usualDishes: string[] }): string {
  return `Meal type: ${o.mealType}. User hint: "${(o.hint ?? '').slice(0, 200)}".\nUser's usual dishes: ${o.usualDishes.slice(0, 10).join(', ') || 'none yet'}`;
}

export function textUserPrompt(o: { mealType: MealType; text: string; usualDishes: string[] }): string {
  return `Meal type: ${o.mealType}. Meal: "${o.text.slice(0, 300)}".\nUser's usual dishes: ${o.usualDishes.slice(0, 10).join(', ') || 'none yet'}`;
}

export const AiItem = z.object({
  key: z.string().min(1).max(40),
  dish: z.string().min(1).max(80),
  unit: Unit,
  qty: z.number().positive().max(5000),
  cooked: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export const AiReply = z.object({
  items: z.array(AiItem).max(12),
  source_guess: z.enum(['home', 'outside', 'unknown']),
  not_food: z.boolean(),
});
export type AiReply = z.infer<typeof AiReply>;

/** JSON Schema for providers that support constrained output (mirrors AiReply). */
export const AI_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'source_guess', 'not_food'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'dish', 'unit', 'qty', 'cooked', 'confidence'],
        properties: {
          key: { type: 'string' },
          dish: { type: 'string' },
          unit: { type: 'string', enum: Unit.options },
          qty: { type: 'number' },
          cooked: { type: 'boolean' },
          confidence: { type: 'number' },
        },
      },
    },
    source_guess: { type: 'string', enum: ['home', 'outside', 'unknown'] },
    not_food: { type: 'boolean' },
  },
} as const;

/** Parse a model reply, tolerating code fences and surrounding prose. */
export function parseAiReply(text: string): { ok: true; value: AiReply } | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in reply' };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const parsed = AiReply.safeParse(json);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  // Keys must be unique so answers map to one item.
  const seen = new Map<string, number>();
  const items = parsed.data.items.map((it) => {
    const base = it.key.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...it, key: n === 1 ? base : `${base}_${n}` };
  });
  return { ok: true, value: { ...parsed.data, items } };
}

export function repairPrompt(badReply: string, error: string): string {
  return `Your previous reply was not valid for the required JSON shape (${error}). Reply again with ONLY the JSON object.\nPrevious reply:\n${badReply.slice(0, 2000)}`;
}
