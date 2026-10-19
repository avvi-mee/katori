// Telegram Bot API calls (token from Edge Function secrets only).
const token = () => Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

export async function tg<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  if (!token()) return null;
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string } | null;
  if (!body?.ok) {
    console.error(`telegram ${method} failed`, res.status, body?.description);
    return null;
  }
  return body.result ?? null;
}

export const send = (chatId: number | string, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, ...extra });

/** Downloads a file the user sent (photos arrive as file_ids). Null if it's missing or over `maxBytes`. */
export async function downloadFile(fileId: string, maxBytes: number): Promise<Uint8Array | null> {
  const file = await tg<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  if (!file?.file_path || (file.file_size ?? 0) > maxBytes) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length > maxBytes ? null : bytes;
}
