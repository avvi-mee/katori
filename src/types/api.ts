// Response shapes of the Edge Functions (see supabase/functions/*).
import type { ComputedItem, Totals } from '@/features/portions/engine';

import type { DraftItem, MealSource, Question } from './meal';

export type DraftResponse = {
  draft_id: string;
  items: DraftItem[];
  questions: Question[];
  source_guess: MealSource | 'unknown';
  unmatched: string[];
};

export type DayTotals = Totals & { meals: number };

export type ConfirmResponse = Totals & {
  meal_id: string;
  items: ComputedItem[];
  source: MealSource;
  unmatched?: string[];
  rejected?: string[];
  day_totals: DayTotals;
  coach_message: { text: string; persona: string; gentle?: boolean } | null;
  duplicate?: boolean;
};
