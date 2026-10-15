// Provider adapter: analyzeImage(provider, image, prompt) / generateText(provider, prompt).
// Switch providers with the AI_PROVIDER secret: gemini (free tier) | claude-haiku-5-5 | claude-sonnet-5-5.
// Keys live only in Edge Function secrets.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';

export const PROVIDERS = ['gemini', 'claude-haiku-5-5', 'claude-sonnet-5-5'] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Prompt = { system: string; user: string; jsonSchema?: Record<string, unknown> };
export type Image = { base64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' };
export type AiResult = { text: string; provider: Provider; latencyMs: number; costUsd: number };

export class AiUnavailable extends Error {}

export function providerFromEnv(): Provider {
  const p = Deno.env.get('AI_PROVIDER') ?? 'gemini';
  return (PROVIDERS as readonly string[]).includes(p) ? (p as Provider) : 'gemini';
}

export const analyzeImage = (provider: Provider, image: Image, prompt: Prompt) => call(provider, prompt, image);
export const generateText = (provider: Provider, prompt: Prompt) => call(provider, prompt);

async function call(provider: Provider, prompt: Prompt, image?: Image): Promise<AiResult> {
  const started = Date.now();
  const { text, costUsd } = provider === 'gemini' ? await gemini(prompt, image) : await claude(provider, prompt, image);
  return { text, provider, latencyMs: Date.now() - started, costUsd };
}

// ─── Gemini (REST) ────────────────────────────────────────────────────────────
async function gemini(prompt: Prompt, image?: Image) {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new AiUnavailable('GEMINI_API_KEY is not set');
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: prompt.system }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...(image ? [{ inline_data: { mime_type: image.mime, data: image.base64 } }] : []),
            { text: prompt.user },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  }).catch((e) => {
    throw new AiUnavailable(`gemini request failed: ${e}`);
  });
  if (!res.ok) throw new AiUnavailable(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) throw new AiUnavailable(`gemini returned no text (${data?.candidates?.[0]?.finishReason ?? 'unknown'})`);
  // shortcut: free tier = $0; add per-token pricing when moving to paid Gemini.
  return { text, costUsd: 0 };
}

// ─── Claude (official SDK) ────────────────────────────────────────────────────
// $ per 1M tokens (input, output), first-party API rates.
const CLAUDE_PRICE: Record<Exclude<Provider, 'gemini'>, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
};

let anthropic: Anthropic | null = null;

async function claude(model: Exclude<Provider, 'gemini'>, prompt: Prompt, image?: Image) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new AiUnavailable('ANTHROPIC_API_KEY is not set');
  anthropic ??= new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });

  const content: Anthropic.ContentBlockParam[] = [
    ...(image
      ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mime, data: image.base64 } }]
      : []),
    { type: 'text', text: prompt.user },
  ];
  const params = {
    model,
    max_tokens: 4096,
    system: prompt.system,
    messages: [{ role: 'user' as const, content }],
    // Naming dishes is quick work: low effort keeps scans fast; the schema guarantees parseable JSON.
    output_config: {
      effort: 'low' as const,
      ...(prompt.jsonSchema ? { format: { type: 'json_schema' as const, schema: prompt.jsonSchema } } : {}),
    },
  };

  let msg: Anthropic.Message | Anthropic.Beta.BetaMessage;
  try {
    msg =
      model === 'claude-sonnet-5-5'
        ? // Server-side refusal fallback (Claude API): a declined request is retried on a fallback model.
          await anthropic.beta.messages.create({
            ...params,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)
        : await anthropic.messages.create(params as Anthropic.MessageCreateParamsNonStreaming);
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new AiUnavailable(`claude ${e.status}: ${e.message}`);
    throw new AiUnavailable(`claude request failed: ${e}`);
  }

  if (msg.stop_reason === 'refusal') throw new AiUnavailable('claude declined the request');
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  if (!text) throw new AiUnavailable(`claude returned no text (${msg.stop_reason})`);
  const [inPrice, outPrice] = CLAUDE_PRICE[model];
  const costUsd = (msg.usage.input_tokens * inPrice + msg.usage.output_tokens * outPrice) / 1_000_000;
  return { text, costUsd };
}
