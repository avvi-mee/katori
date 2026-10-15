import type { MealType, Unit } from '@/types/meal';

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

/** 1.5 → "1½", 0.5 → "½", 2 → "2". */
export function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = FRACTIONS[(Math.round((qty - whole) * 100) / 100).toString()];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 10) / 10);
}

const UNIT_LABEL: Record<Unit, [string, string]> = {
  katori: ['katori', 'katori'],
  roti: ['roti', 'roti'],
  piece: ['piece', 'pieces'],
  plate: ['plate', 'plates'],
  scoop: ['scoop', 'scoops'],
  glass: ['glass', 'glasses'],
  tbsp: ['tbsp', 'tbsp'],
  g: ['g', 'g'],
};

/** "1½ katori", "2 roti", "150 g". */
export function formatAmount(qty: number, unit: Unit): string {
  const [one, many] = UNIT_LABEL[unit];
  return `${formatQty(qty)} ${qty > 1 && unit !== 'g' ? many : one}`;
}

/** Default meal for the time of day (local clock). */
export function mealTypeFor(at: Date = new Date()): MealType {
  const h = at.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const kcalText = (n: number) => Math.round(n).toLocaleString('en-IN');
