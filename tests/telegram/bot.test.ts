import { describe, expect, it } from 'vitest';

import {
  addAnswer,
  callbackData,
  errorText,
  keyboardFor,
  mealTypeForHour,
  nextQuestion,
  parseCallback,
  questionText,
  savedText,
  startCode,
} from '@/features/telegram/bot';
import type { Question } from '@/types/meal';

const DRAFT = '0f8fad5b-d9cb-469f-a165-70867728950e';
const q = (id: string, labels: string[]): Question => ({
  id,
  item_key: 'item_0',
  kind: 'portion',
  prompt: `${id}?`,
  options: labels.map((label, i) => ({ id: `${id}_${i}`, label, value: i + 1 })),
  default_option: `${id}_1`,
});
const questions = [q('dal', ['Half', '1 katori', '1.5', '2']), q('oil', ['Less', 'Normal', 'More'])];

describe('telegram bot helpers', () => {
  it('picks the meal type from the IST hour', () => {
    expect([7, 13, 17, 21, 2].map(mealTypeForHour)).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'dinner']);
  });

  it('reads the deep-link code', () => {
    expect(startCode('/start abcd2345')).toBe('ABCD2345');
    expect(startCode('/start@KatoriBot ABCD2345')).toBe('ABCD2345');
    expect(startCode('/start')).toBeNull();
    expect(startCode('hello')).toBeNull();
  });

  it('keeps callback data under 64 bytes and round-trips it', () => {
    const data = callbackData(DRAFT, 2, 11);
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
    expect(parseCallback(data)).toEqual({ draftId: DRAFT, q: 2, o: 11 });
    expect(parseCallback('a|nope|1|1')).toBeNull();
    expect(parseCallback(undefined)).toBeNull();
  });

  it('lays out buttons three to a row', () => {
    const kb = keyboardFor(questions, 0, DRAFT);
    expect(kb.map((r) => r.map((b) => b.text))).toEqual([['Half', '1 katori', '1.5'], ['2']]);
    expect(parseCallback(kb[1]![0]!.callback_data)).toEqual({ draftId: DRAFT, q: 0, o: 3 });
  });

  it('collects answers one tap at a time', () => {
    let answers = addAnswer(questions, [], 0, 1)!;
    expect(nextQuestion(questions, answers)).toBe(1);
    answers = addAnswer(questions, answers, 0, 2)!; // re-tap replaces
    expect(answers).toEqual([{ question_id: 'dal', option_id: 'dal_2' }]);
    answers = addAnswer(questions, answers, 1, 0)!;
    expect(nextQuestion(questions, answers)).toBeNull();
    expect(addAnswer(questions, answers, 5, 0)).toBeNull();
    expect(questionText(questions, 1, ['Dal', 'Rice'])).toBe('I see: Dal, Rice.\n\noil? (2/2)');
  });

  it('formats the saved reply and errors', () => {
    const text = savedText({
      items: [
        { dish: 'Dal tadka', kcal: 186 },
        { dish: 'Roti', kcal: 206.4 },
      ],
      kcal: 392.4,
      kcal_low: 340,
      kcal_high: 450,
      protein_g: 15.6,
      day: { kcal: 1240, protein_g: 52 },
      kcalTarget: 1800,
      coach: 'Beta, raat ko paneer lena.',
    });
    expect(text).toBe(
      '✅ Saved: Dal tadka (186), Roti (206)\n392 kcal (340–450) · 16 g protein\nToday: 1,240 / 1,800 kcal · 52 g protein\n\nBeta, raat ko paneer lena.',
    );
    expect(errorText('BAD_IMAGE')).toMatch(/couldn't see food/);
    expect(errorText('WHATEVER')).toMatch(/Something went wrong/);
  });
});
