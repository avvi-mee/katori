// telegram-webhook: the Katori Telegram bot. /start CODE links a chat to an account (code made in the app);
// a photo runs the same analyze → portion questions (inline buttons) → confirm → coach reply pipeline as the
// app. Telegram is set up with secret_token = TELEGRAM_WEBHOOK_SECRET; anything without it is rejected.
// Always answers 200 once verified, so Telegram doesn't retry a failure into a loop.
import { ConfirmBody, confirmMeal } from '../_shared/confirm.ts';
import {
  addAnswer,
  errorText,
  keyboardFor,
  mealTypeForHour,
  nextQuestion,
  parseCallback,
  questionText,
  savedText,
  startCode,
} from '../_shared/gen/features/telegram/bot.ts';
import { timingSafeEqual } from '../_shared/gen/features/billing/webhook.ts';
import { dayTotals } from '../_shared/meals.ts';
import { adminClient, HttpError, json, reportError, type Admin } from '../_shared/http.ts';
import { analyzePhoto } from '../_shared/scan.ts';
import { downloadFile, send, tg } from '../_shared/telegram.ts';
import type { Answer, Question } from '../_shared/gen/types/meal.ts';

type Chat = { id: number };
type Update = {
  message?: { chat: Chat; text?: string; photo?: { file_id: string; file_size?: number }[]; caption?: string };
  callback_query?: { id: string; data?: string; message?: { chat: Chat; message_id: number } };
};

const MAX_PHOTO = 2 * 1024 * 1024;
const enc = new TextEncoder();
const ok = () => json({ ok: true });
const appUrl = () => Deno.env.get('APP_URL') ?? 'https://katori.unmatrix.in';
const istHour = () => new Date(Date.now() + 330 * 60_000).getUTCHours();
const LINK_HELP = () =>
  `To log meals here, link your Katori account: open ${appUrl()} → Me → Connect Telegram, then tap the link.`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: { code: 'BAD_REQUEST', message: 'POST only' } }, 405);
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
  const given = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !timingSafeEqual(enc.encode(given), enc.encode(secret)))
    return json({ error: { code: 'UNAUTHENTICATED', message: 'bad secret' } }, 401);

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return ok();
  }
  const admin = adminClient();
  try {
    if (update.callback_query) await onTap(admin, update.callback_query);
    else if (update.message) await onMessage(admin, update.message);
  } catch (e) {
    await reportError(e, 'telegram-webhook');
    const chat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chat) await send(chat, errorText(e instanceof HttpError ? e.code : undefined));
  }
  return ok();
});

async function userFor(admin: Admin, chatId: number): Promise<string | null> {
  const { data } = await admin
    .from('channel_links')
    .select('user_id')
    .eq('channel', 'telegram')
    .eq('external_id', String(chatId))
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function onMessage(admin: Admin, m: NonNullable<Update['message']>) {
  const chat = m.chat.id;
  const code = startCode(m.text);
  if (code) return link(admin, chat, code);
  if (m.text?.startsWith('/start') || m.text?.startsWith('/help'))
    return send(chat, `Namaste! Send me a photo of your plate and I'll count it.\n\n${LINK_HELP()}`);

  const uid = await userFor(admin, chat);
  if (!uid) return send(chat, LINK_HELP());

  if (m.text?.startsWith('/today')) {
    const t = await dayTotals(admin, uid, new Date());
    return send(chat, `Today: ${Math.round(t.kcal)} kcal · ${Math.round(t.protein_g)} g protein · ${t.meals} meals`);
  }
  if (!m.photo?.length) return send(chat, 'Send me a photo of your meal 📸 (or /today for your totals).');

  // Telegram sends several sizes; take the largest that fits our 2 MB limit.
  const photo = [...m.photo].reverse().find((p) => (p.file_size ?? 0) <= MAX_PHOTO) ?? m.photo[0]!;
  const bytes = await downloadFile(photo.file_id, MAX_PHOTO);
  if (!bytes) return send(chat, errorText('BAD_IMAGE'));
  const path = `${uid}/tg-${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage.from('meal-photos').upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw error;
  await tg('sendChatAction', { chat_id: chat, action: 'typing' });

  const draft = await analyzePhoto(admin, uid, {
    imagePath: path,
    mealType: mealTypeForHour(istHour()),
    hint: m.caption?.slice(0, 200),
    inputMode: 'telegram',
  });
  const questions = draft.questions as Question[];
  if (!questions.length) return finish(admin, uid, chat, null, draft.draft_id, []);
  await admin.from('channel_drafts').insert({ draft_id: draft.draft_id, channel: 'telegram', chat_id: String(chat) });
  const dishes = (draft.items as { dish: string }[]).map((i) => i.dish);
  await send(chat, questionText(questions, 0, dishes), {
    reply_markup: { inline_keyboard: keyboardFor(questions, 0, draft.draft_id) },
  });
}

async function link(admin: Admin, chat: number, code: string) {
  const { data: row } = await admin
    .from('channel_link_codes')
    .select('user_id, expires_at')
    .eq('code', code)
    .eq('channel', 'telegram')
    .maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now())
    return send(chat, `That link has expired. Make a new one in the app: ${appUrl()} → Me → Connect Telegram.`);
  // One chat per account and one account per chat.
  await admin.from('channel_links').delete().eq('channel', 'telegram').eq('user_id', row.user_id);
  await admin.from('channel_links').delete().eq('channel', 'telegram').eq('external_id', String(chat));
  const { error } = await admin
    .from('channel_links')
    .insert({ user_id: row.user_id, channel: 'telegram', external_id: String(chat) });
  if (error) throw error;
  await admin.from('channel_link_codes').delete().eq('code', code);
  await send(chat, 'Linked ✅ Send me a photo of your plate whenever you eat. /today shows your totals.');
}

async function onTap(admin: Admin, cb: NonNullable<Update['callback_query']>) {
  const parsed = parseCallback(cb.data);
  const chat = cb.message?.chat.id;
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  if (!parsed || !chat) return;
  const uid = await userFor(admin, chat);
  if (!uid) return send(chat, LINK_HELP());

  const { data: state } = await admin
    .from('channel_drafts')
    .select('answers, chat_id')
    .eq('draft_id', parsed.draftId)
    .maybeSingle();
  if (!state || state.chat_id !== String(chat)) return send(chat, errorText('NOT_FOUND'));
  const { data: draft } = await admin
    .from('meal_drafts')
    .select('questions, items, user_id')
    .eq('id', parsed.draftId)
    .maybeSingle();
  if (!draft || draft.user_id !== uid) return send(chat, errorText('NOT_FOUND'));

  const questions = draft.questions as Question[];
  const answers = addAnswer(questions, state.answers as Answer[], parsed.q, parsed.o);
  if (!answers) return;
  const next = nextQuestion(questions, answers);
  if (next !== null) {
    await admin.from('channel_drafts').update({ answers }).eq('draft_id', parsed.draftId);
    await tg('editMessageText', {
      chat_id: chat,
      message_id: cb.message!.message_id,
      text: questionText(questions, next, []),
      reply_markup: { inline_keyboard: keyboardFor(questions, next, parsed.draftId) },
    });
    return;
  }
  await finish(admin, uid, chat, cb.message!.message_id, parsed.draftId, answers);
}

/** Saves the meal (the draft id doubles as the idempotency key, so a double tap can't save twice). */
async function finish(
  admin: Admin,
  uid: string,
  chat: number,
  messageId: number | null,
  draftId: string,
  answers: Answer[],
) {
  const body = ConfirmBody.parse({ client_id: draftId, draft_id: draftId, answers });
  const r = (await confirmMeal(admin, uid, body)) as {
    items: { dish: string; kcal: number }[];
    kcal: number;
    kcal_low: number;
    kcal_high: number;
    protein_g: number;
    day_totals: { kcal: number; protein_g: number };
    coach_message: { text: string } | null;
  };
  await admin.from('channel_drafts').delete().eq('draft_id', draftId);
  const [{ data: goals }, { data: profile }] = await Promise.all([
    admin.from('goals').select('kcal').eq('user_id', uid).maybeSingle(),
    admin.from('profiles').select('kcal_target').eq('id', uid).single(),
  ]);
  const text = savedText({
    items: r.items.map((i) => ({ dish: i.dish, kcal: Number(i.kcal) })),
    kcal: Number(r.kcal),
    kcal_low: Number(r.kcal_low),
    kcal_high: Number(r.kcal_high),
    protein_g: Number(r.protein_g),
    day: r.day_totals,
    kcalTarget: (goals?.kcal as number | null) ?? (profile?.kcal_target as number | null) ?? null,
    coach: r.coach_message?.text ?? null,
  });
  if (messageId) await tg('editMessageText', { chat_id: chat, message_id: messageId, text });
  else await send(chat, text);
}
