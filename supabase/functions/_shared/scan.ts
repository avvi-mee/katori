// The photo → draft pipeline shared by analyze-meal (app) and telegram-webhook (bot): quota, image checks,
// AI naming, food matching, ≤3 questions, saved draft. Only successful scans count against the quota.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

import { analyzeImage, providerFromEnv, type Image } from './ai.ts';
import { AI_REPLY_JSON_SCHEMA, SYSTEM_PROMPT, userPrompt } from './gen/features/scan/prompt.ts';
import type { MealSource, MealType } from './gen/types/meal.ts';
import { fail, type Admin } from './http.ts';
import { countUsage, createDraft, guardQuota, loadUserContext, runAi, usualDishNames } from './meals.ts';

const MAX_BYTES = 2 * 1024 * 1024;

/** JPEG/PNG/WebP only, by magic bytes (never trust the file name). */
export function sniff(b: Uint8Array): Image['mime'] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function analyzePhoto(
  admin: Admin,
  uid: string,
  o: { imagePath: string; mealType: MealType; hint?: string; source?: MealSource; inputMode: 'photo' | 'telegram' },
) {
  // Photos must sit inside the user's own folder.
  if (!o.imagePath.startsWith(`${uid}/`) || o.imagePath.includes('..')) fail('BAD_IMAGE', 'Photo not found.');

  const { ctx, isPro } = await loadUserContext(admin, uid);
  const day = await guardQuota(admin, uid, 'scan', isPro);

  const { data: blob, error } = await admin.storage.from('meal-photos').download(o.imagePath);
  if (error || !blob) fail('BAD_IMAGE', 'Photo not found.');
  if (blob.size > MAX_BYTES) fail('BAD_IMAGE', 'Photo is too large.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) fail('BAD_IMAGE', 'Use a JPEG, PNG or WebP photo.');

  const provider = providerFromEnv();
  const prompt = {
    system: SYSTEM_PROMPT,
    user: userPrompt({ mealType: o.mealType, hint: o.hint, usualDishes: await usualDishNames(admin, uid) }),
    jsonSchema: AI_REPLY_JSON_SCHEMA as unknown as Record<string, unknown>,
  };
  const { reply, meta } = await runAi(
    () => analyzeImage(provider, { base64: encodeBase64(bytes), mime }, prompt),
    provider,
    prompt,
  );

  const draft = await createDraft(admin, uid, reply, {
    ctx,
    mealType: o.mealType,
    source: o.source,
    inputMode: o.inputMode,
    photoPath: o.imagePath,
    meta,
  });
  await countUsage(admin, uid, day, 'p_scans');
  return draft;
}
