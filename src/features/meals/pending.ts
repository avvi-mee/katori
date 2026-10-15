import { applyAnswers, computeItem, totals, type Food, type PortionContext } from '@/features/portions/engine';
import type { PendingMeal } from '@/lib/outbox';
import type { DraftResponse } from '@/types/api';
import type { Answer, MealSource, MealType, OilLevel, Unit } from '@/types/meal';

export type ConfirmBody =
  | { client_id: string; draft_id: string; answers: Answer[]; eaten_at?: string }
  | {
      client_id: string;
      meal_type: MealType;
      source: MealSource;
      items: { food_item_id: string; unit: Unit; qty: number; oil_level?: OilLevel | null }[];
      eaten_at?: string;
    };

/**
 * Local preview of a meal that is waiting in the outbox, computed by the same engine the server uses,
 * from the cached food_items table. The server's numbers replace it once the meal syncs.
 */
export function buildPending(
  body: ConfirmBody,
  deps: { foods: Food[]; ctx: PortionContext; draft: DraftResponse | null; draftMealType: MealType },
): PendingMeal | null {
  const foods = new Map(deps.foods.map((f) => [f.id, f]));
  const eaten_at = body.eaten_at ?? new Date().toISOString();

  if ('draft_id' in body) {
    const draft = deps.draft;
    if (!draft || draft.draft_id !== body.draft_id) return null;
    const r = applyAnswers(draft.items, draft.questions, body.answers, foods, deps.ctx, {
      sourceGuess: draft.source_guess,
    });
    if (!r.items.length) return null;
    return {
      client_id: body.client_id,
      eaten_at,
      meal_type: deps.draftMealType,
      source: r.source,
      items: r.items,
      totals: totals(r.items),
    };
  }

  const items = body.items.flatMap((it, n) => {
    const food = foods.get(it.food_item_id);
    if (!food) return [];
    return [
      computeItem(
        food,
        {
          key: `item_${n}`,
          dish: food.name,
          unit: it.unit,
          qty: it.qty,
          oil_level: it.oil_level ?? null,
          confidence: 1,
          certainty: 'asked',
        },
        deps.ctx,
        body.source,
      ),
    ];
  });
  if (!items.length) return null;
  return {
    client_id: body.client_id,
    eaten_at,
    meal_type: body.meal_type,
    source: body.source,
    items,
    totals: totals(items),
  };
}
