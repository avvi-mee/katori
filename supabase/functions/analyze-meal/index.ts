// analyze-meal: photo in storage → AI names dishes → server matches food_items and builds ≤3 questions.
// Contract: { image_path, hint_text?, meal_type, source? } → { draft_id, items, questions }
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { z } from 'npm:zod@4.6.7';

import { analyzeImage, providerFromEnv, type Image } from '../_shared/ai.ts';
import { AI_REPLY_JSON_SCHEMA, SYSTEM_PROMPT, userPrompt } from '../_shared/gen/features/scan/prompt.ts';
import { MealSource, MealType } from '../_shared/gen/types/meal.ts';
import { adminClient, fail, json, readBody, requireUser, serve } from '../_shared/http.ts';
import { countUsage, createDraft, guardQuota, loadUserContext, runAi, usualDishNames } from '../_shared/meals.ts';

const Body = z.object({
  image_path: z.string().min(3).max(300),
  hint_text: z.string().max(200).optional(),
  meal_type: MealType,
  source: MealSource.optional(),
});

const MAX_BYTES = 2 * 1024 * 1024;

/** JPEG/PNG/WebP only, by magic bytes (never trust the file name). */
function sniff(b: Uint8Array): Image['mime'] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const body = await readBody(req, Body);

  // Users can only analyze photos inside their own folder.
  if (!body.image_path.startsWith(`${user.id}/`) || body.image_path.includes('..'))
    fail('BAD_IMAGE', 'Photo not found.');

  const { ctx, isPro } = await loadUserContext(admin, user.id);
  const day = await guardQuota(admin, user.id, 'scan', isPro);

  const { data: blob, error } = await admin.storage.from('meal-photos').download(body.image_path);
  if (error || !blob) fail('BAD_IMAGE', 'Photo not found.');
  if (blob.size > MAX_BYTES) fail('BAD_IMAGE', 'Photo is too large.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) fail('BAD_IMAGE', 'Use a JPEG, PNG or WebP photo.');

  const provider = providerFromEnv();
  const prompt = {
    system: SYSTEM_PROMPT,
    user: userPrompt({
      mealType: body.meal_type,
      hint: body.hint_text,
      usualDishes: await usualDishNames(admin, user.id),
    }),
    jsonSchema: AI_REPLY_JSON_SCHEMA as unknown as Record<string, unknown>,
  };
  const { reply, meta } = await runAi(
    () => analyzeImage(provider, { base64: encodeBase64(bytes), mime }, prompt),
    provider,
    prompt,
  );

  const draft = await createDraft(admin, user.id, reply, {
    ctx,
    mealType: body.meal_type,
    source: body.source,
    inputMode: 'photo',
    photoPath: body.image_path,
    meta,
  });
  // Only successful scans count against the quota.
  await countUsage(admin, user.id, day, 'p_scans');
  return json(draft);
});
