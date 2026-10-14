// server-shared: imported by Edge Functions too. Only bare `zod` imports, no RN/Node APIs.
import { z } from 'zod';

export const Unit = z.enum(['katori', 'roti', 'piece', 'plate', 'scoop', 'glass', 'tbsp', 'g']);
export type Unit = z.infer<typeof Unit>;

export const MealType = z.enum(['breakfast', 'lunch', 'snack', 'dinner']);
export type MealType = z.infer<typeof MealType>;

export const MealSource = z.enum(['home', 'outside']);
export type MealSource = z.infer<typeof MealSource>;

export const OilLevel = z.enum(['kam', 'normal', 'zyada']);
export type OilLevel = z.infer<typeof OilLevel>;

// Shared item schema, exactly as in docs/ARCHITECTURE.md.
export const DraftItem = z.object({
  key: z.string(), // "dal", "rice"
  dish: z.string(), // "Dal tadka"
  food_item_id: z.string().uuid().nullable(),
  unit: Unit,
  qty: z.number().positive(), // best guess or the user's usual
  confidence: z.number().min(0).max(1),
  cooked: z.boolean(), // true -> oil question applies
});
export type DraftItem = z.infer<typeof DraftItem>;

export const Question = z.object({
  id: z.string(),
  item_key: z.string().nullable(), // null for meal-level (source)
  kind: z.enum(['portion', 'count', 'plate', 'oil', 'source', 'ghee']),
  prompt: z.string(), // "Dal kitni thi?"
  options: z.array(z.object({ id: z.string(), label: z.string(), value: z.number() })),
  default_option: z.string(),
});
export type Question = z.infer<typeof Question>;

export const Answer = z.object({ question_id: z.string(), option_id: z.string() });
export type Answer = z.infer<typeof Answer>;

export const ErrorCode = z.enum([
  'UNAUTHENTICATED',
  'QUOTA_EXCEEDED',
  'NEEDS_PRO',
  'BAD_IMAGE',
  'AI_UNAVAILABLE',
  'RATE_LIMITED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
