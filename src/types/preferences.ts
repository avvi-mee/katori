// server-shared: profiles.preferences jsonb (docs/ARCHITECTURE.md "Habits, goals and preferences").
// Every field has a default and a .catch, so a stale or hand-edited value never breaks a screen:
// parsePreferences keeps the valid fields and falls back per field.
import { z } from 'zod';

export const Equipment = z.enum([
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebells',
  'bands',
  'body_only',
  'ez_bar',
  'medicine_ball',
  'exercise_ball',
  'foam_roll',
  'other',
]);
export type Equipment = z.infer<typeof Equipment>;

export const TodayModule = z.enum(['food', 'train', 'activity', 'habits', 'body']);
export type TodayModule = z.infer<typeof TodayModule>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const Preferences = z.object({
  training_place: z.enum(['gym', 'home', 'both']).default('gym').catch('gym'),
  equipment: z.array(Equipment).max(20).default([]).catch([]),
  training_days: z.number().int().min(0).max(7).default(3).catch(3),
  /** 0 = Sunday … 6 = Saturday; empty = derived from training_days (see goals engine). */
  training_weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]).catch([]),
  units: z
    .object({
      weight: z.enum(['kg', 'lb']).default('kg').catch('kg'),
      distance: z.enum(['km', 'mi']).default('km').catch('km'),
    })
    .default({ weight: 'kg', distance: 'km' })
    .catch({ weight: 'kg', distance: 'km' }),
  cuisines: z.array(z.string().max(40)).max(20).default([]).catch([]),
  avoid_foods: z.array(z.string().max(60)).max(50).default([]).catch([]),
  modules: z
    .array(TodayModule)
    .default(['food', 'train', 'activity', 'habits'])
    .catch(['food', 'train', 'activity', 'habits']),
  reminders: z
    .object({
      meals: z.array(HHMM).max(6).default([]).catch([]),
      workout: HHMM.nullable().default(null).catch(null),
      weigh_in: HHMM.nullable().default(null).catch(null),
    })
    .default({ meals: [], workout: null, weigh_in: null })
    .catch({ meals: [], workout: null, weigh_in: null }),
  /** Workout/run calories stay out of food targets unless the user opts in (Workout tracker table). */
  add_burn_to_targets: z.boolean().default(false).catch(false),
  default_rest_s: z.number().int().min(0).max(900).default(90).catch(90),
});
export type Preferences = z.infer<typeof Preferences>;

/** Reads profiles.preferences (any shape) into a complete, valid object. */
export function parsePreferences(raw: unknown): Preferences {
  return Preferences.parse(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
}
