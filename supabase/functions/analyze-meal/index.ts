// analyze-meal: photo in storage → AI names dishes → server matches food_items and builds ≤3 questions.
// Contract: { image_path, hint_text?, meal_type, source? } → { draft_id, items, questions }
import { z } from 'npm:zod@4.6.7';

import { MealSource, MealType } from '../_shared/gen/types/meal.ts';
import { adminClient, json, readBody, requireUser, serve } from '../_shared/http.ts';
import { analyzePhoto } from '../_shared/scan.ts';

const Body = z.object({
  image_path: z.string().min(3).max(300),
  hint_text: z.string().max(200).optional(),
  meal_type: MealType,
  source: MealSource.optional(),
});

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const body = await readBody(req, Body);
  return json(
    await analyzePhoto(admin, user.id, {
      imagePath: body.image_path,
      mealType: body.meal_type,
      hint: body.hint_text,
      source: body.source,
      inputMode: 'photo',
    }),
  );
});
