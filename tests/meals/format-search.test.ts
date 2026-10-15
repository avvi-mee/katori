import { describe, expect, it } from 'vitest';

import { formatAmount, formatQty, mealTypeFor } from '@/features/meals/format';
import { searchFoods } from '@/features/meals/search';

describe('formatQty / formatAmount', () => {
  it('uses Indian-kitchen fractions', () => {
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(1.5)).toBe('1½');
    expect(formatQty(2)).toBe('2');
    expect(formatQty(0.48)).toBe('0.5');
  });
  it('pluralises units', () => {
    expect(formatAmount(1.5, 'katori')).toBe('1½ katori');
    expect(formatAmount(2, 'piece')).toBe('2 pieces');
    expect(formatAmount(150, 'g')).toBe('150 g');
  });
});

describe('mealTypeFor', () => {
  it('picks the meal by time of day', () => {
    expect(mealTypeFor(new Date(2026, 9, 15, 8))).toBe('breakfast');
    expect(mealTypeFor(new Date(2026, 9, 15, 13))).toBe('lunch');
    expect(mealTypeFor(new Date(2026, 9, 15, 17))).toBe('snack');
    expect(mealTypeFor(new Date(2026, 9, 15, 21))).toBe('dinner');
  });
});

describe('searchFoods', () => {
  const foods = [
    { id: '1', name: 'Steamed Rice', aliases: ['chawal', 'bhaat'], kind: 'dish' },
    { id: '2', name: 'Rice (raw)', aliases: [], kind: 'ingredient' },
    { id: '3', name: 'Paneer Butter Masala', aliases: ['paneer makhani'], kind: 'dish' },
    { id: '4', name: 'Paneer', aliases: ['cottage cheese'], kind: 'ingredient' },
  ];
  it('matches aliases (Hindi names)', () => {
    expect(searchFoods(foods, 'chawal').map((f) => f.id)).toEqual(['1']);
  });
  it('ranks cooked dishes above raw ingredients', () => {
    expect(searchFoods(foods, 'rice').map((f) => f.id)).toEqual(['1', '2']);
    expect(searchFoods(foods, 'paneer').map((f) => f.id)).toEqual(['3', '4']);
  });
  it('ignores case, punctuation and empty queries', () => {
    expect(searchFoods(foods, '  BUTTER! ').map((f) => f.id)).toEqual(['3']);
    expect(searchFoods(foods, '')).toEqual([]);
  });
});
