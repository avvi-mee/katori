// log-text: "2 roti aur dal" → same draft + questions as analyze-meal (cheap text-only AI call).
// Repeated texts are served from ai_cache and don't count against the quota.
import { z } from 'npm:zod@4.6.7';

import { generateText, providerFromEnv } from '../_shared/ai.ts';
import {
  AI_REPLY_JSON_SCHEMA,
  AiReply,
  TEXT_SYSTEM_PROMPT,
  textUserPrompt,
} from '../_shared/gen/features/scan/prompt.ts';
import { MealSource, MealType } from '../_shared/gen/types/meal.ts';
import { adminClient, json, readBody, requireUser, serve } from '../_shared/http.ts';
import { countUsage, createDraft, guardQuota, loadUserContext, runAi } from '../_shared/meals.ts';

const Body = z.object({ text: z.string().trim().min(2).max(300), meal_type: MealType, source: MealSource.optional() });

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const body = await readBody(req, Body);
  const { ctx, isPro } = await loadUserContext(admin, user.id);

  const key = `text:v1:${body.text.toLowerCase().replace(/\s+/g, ' ')}`;
  const { data: cached } = await admin.from('ai_cache').select('payload, hits').eq('key', key).maybeSingle();
  const hit = cached ? AiReply.safeParse(cached.payload) : null;

  const day = await guardQuota(admin, user.id, 'text', isPro, { skipQuota: !!hit?.success });

  let reply: AiReply;
  if (hit?.success) {
    reply = hit.data;
    await admin
      .from('ai_cache')
      .update({ hits: (cached!.hits ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('key', key);
  } else {
    const provider = providerFromEnv();
    // Usual dishes are left out of the prompt so the cached reply is valid for every user.
    const prompt = {
      system: TEXT_SYSTEM_PROMPT,
      user: textUserPrompt({ mealType: body.meal_type, text: body.text, usualDishes: [] }),
      jsonSchema: AI_REPLY_JSON_SCHEMA as unknown as Record<string, unknown>,
    };
    const result = await runAi(() => generateText(provider, prompt), provider, prompt);
    reply = result.reply;
    await admin.from('ai_cache').upsert({ key, payload: reply, hits: 0, updated_at: new Date().toISOString() });
    await countUsage(admin, user.id, day, 'p_text_logs');
  }

  return json(
    await createDraft(admin, user.id, reply, { ctx, mealType: body.meal_type, source: body.source, inputMode: 'text' }),
  );
});
