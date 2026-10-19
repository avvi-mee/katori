// server-shared: Telegram bot conversation helpers (docs/ARCHITECTURE.md "Channels"). Pure: the webhook does
// the I/O. Callback data must fit Telegram's 64-byte limit, so answers travel as question/option indexes.
import type { Answer, Question } from '../../types/meal.ts';

export type InlineButton = { text: string; callback_data: string };

/** Meal type from the IST hour the photo arrived. */
export function mealTypeForHour(hour: number): 'breakfast' | 'lunch' | 'snack' | 'dinner' {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 19) return 'snack';
  return 'dinner';
}

/** "/start ABCD2345" → "ABCD2345" (deep-link payload), else null. */
export function startCode(text: string | undefined): string | null {
  const m = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{8})\s*$/.exec(text ?? '');
  return m ? m[1]!.toUpperCase() : null;
}

export const callbackData = (draftId: string, q: number, o: number) => `a|${draftId}|${q}|${o}`;

export function parseCallback(data: string | undefined): { draftId: string; q: number; o: number } | null {
  const m = /^a\|([0-9a-f-]{36})\|(\d{1,2})\|(\d{1,2})$/.exec(data ?? '');
  return m ? { draftId: m[1]!, q: Number(m[2]), o: Number(m[3]) } : null;
}

/** One question as inline buttons, three to a row. */
export function keyboardFor(questions: Question[], q: number, draftId: string): InlineButton[][] {
  const opts = questions[q]?.options ?? [];
  const rows: InlineButton[][] = [];
  opts.forEach((opt, o) => {
    if (o % 3 === 0) rows.push([]);
    rows.at(-1)!.push({ text: opt.label, callback_data: callbackData(draftId, q, o) });
  });
  return rows;
}

/** Records a tap; returns the answers so far (a re-tap replaces that question's answer). */
export function addAnswer(questions: Question[], answers: Answer[], q: number, o: number): Answer[] | null {
  const question = questions[q];
  const option = question?.options[o];
  if (!question || !option) return null;
  return [...answers.filter((a) => a.question_id !== question.id), { question_id: question.id, option_id: option.id }];
}

/** Index of the first unanswered question, or null when all are answered. */
export function nextQuestion(questions: Question[], answers: Answer[]): number | null {
  const i = questions.findIndex((q) => !answers.some((a) => a.question_id === q.id));
  return i < 0 ? null : i;
}

export function questionText(questions: Question[], q: number, dishes: string[]): string {
  const head = dishes.length ? `I see: ${dishes.join(', ')}.\n\n` : '';
  return `${head}${questions[q]!.prompt} (${q + 1}/${questions.length})`;
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-IN');

/** The reply after a meal is saved: items, kcal range, protein, the day so far, and the coach line. */
export function savedText(r: {
  items: { dish: string; kcal: number }[];
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  day: { kcal: number; protein_g: number };
  kcalTarget: number | null;
  coach: string | null;
}): string {
  const lines = [
    `✅ Saved: ${r.items.map((i) => `${i.dish} (${n0(i.kcal)})`).join(', ')}`,
    `${n0(r.kcal)} kcal (${n0(r.kcal_low)}–${n0(r.kcal_high)}) · ${n0(r.protein_g)} g protein`,
    `Today: ${n0(r.day.kcal)}${r.kcalTarget ? ` / ${n0(r.kcalTarget)}` : ''} kcal · ${n0(r.day.protein_g)} g protein`,
  ];
  if (r.coach) lines.push('', r.coach);
  return lines.join('\n');
}

/** Friendly replies for the API error codes (never raw server messages). */
export const ERROR_TEXT: Record<string, string> = {
  QUOTA_EXCEEDED: "That's today's free scan. Log the rest in the app for free, or get Pro for unlimited scans.",
  NEEDS_PRO: "That's today's free scan. Log the rest in the app for free, or get Pro for unlimited scans.",
  RATE_LIMITED: 'One photo at a time, please. Try again in a few seconds.',
  BAD_IMAGE: "I couldn't see food in that photo. Try one more from above, with the whole plate in frame.",
  AI_UNAVAILABLE: "I couldn't read that meal right now. Please try again, or log it in the app.",
  NOT_FOUND: 'That meal expired. Send the photo again.',
};
export const errorText = (code: string | undefined) =>
  (code && ERROR_TEXT[code]) || 'Something went wrong. Please try again.';
