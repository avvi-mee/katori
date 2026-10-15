import { describe, expect, it } from 'vitest';

import { AI_REPLY_JSON_SCHEMA, parseAiReply, SYSTEM_PROMPT, userPrompt } from '@/features/scan/prompt';
import { Unit } from '@/types/meal';

const good = {
  items: [
    { key: 'dal', dish: 'Dal tadka', unit: 'katori', qty: 1, cooked: true, confidence: 0.7 },
    { key: 'roti', dish: 'Roti', unit: 'roti', qty: 2, cooked: false, confidence: 0.9 },
  ],
  source_guess: 'home',
  not_food: false,
};

describe('prompt contract', () => {
  it('tells the model it does not calculate calories', () => {
    expect(SYSTEM_PROMPT).toMatch(/do NOT calculate calories/);
  });
  it('includes the user hint and usual dishes', () => {
    const p = userPrompt({ mealType: 'lunch', hint: 'less oil', usualDishes: ['Dal Tadka', 'Roti'] });
    expect(p).toContain('Meal type: lunch');
    expect(p).toContain('"less oil"');
    expect(p).toContain('Dal Tadka, Roti');
  });
  it('keeps the JSON schema in sync with the unit enum', () => {
    expect(AI_REPLY_JSON_SCHEMA.properties.items.items.properties.unit.enum).toEqual(Unit.options);
  });
});

describe('parseAiReply', () => {
  it('parses a plain JSON reply', () => {
    const r = parseAiReply(JSON.stringify(good));
    expect(r.ok && r.value.items).toHaveLength(2);
  });
  it('tolerates code fences and prose around the JSON', () => {
    const r = parseAiReply('Sure!\n```json\n' + JSON.stringify(good) + '\n```');
    expect(r.ok).toBe(true);
  });
  it('rejects calorie-free garbage and wrong units', () => {
    expect(parseAiReply('no idea').ok).toBe(false);
    const bad = { ...good, items: [{ ...good.items[0], unit: 'bowl' }] };
    const r = parseAiReply(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unit/);
  });
  it('makes duplicate keys unique', () => {
    const dup = { ...good, items: [good.items[1], { ...good.items[1], dish: 'Butter roti' }] };
    const r = parseAiReply(JSON.stringify(dup));
    expect(r.ok && r.value.items.map((i) => i.key)).toEqual(['roti', 'roti_2']);
  });
  it('accepts not_food replies', () => {
    const r = parseAiReply(JSON.stringify({ items: [], source_guess: 'unknown', not_food: true }));
    expect(r.ok && r.value.not_food).toBe(true);
  });
});
