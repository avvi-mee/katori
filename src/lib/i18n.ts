// Plain dictionaries, no library. `hinglish` falls back to `en` for missing keys.
export type Locale = 'en' | 'hinglish';

const en = {
  'common.looksRight': 'Looks right',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.undo': 'Undo',
  'common.close': 'Close',
  'portion.title': 'Quick check',
  'portion.subtitle': 'Tap to fix anything that looks off.',
  'portion.allSet': 'All set — we know your usual.',
  'macro.protein': 'Protein',
  'macro.carbs': 'Carbs',
  'macro.fat': 'Fat',
  'report.title': 'Your week',
  'report.avgKcal': 'avg kcal / day',
  'report.proteinDays': 'protein goal days',
  'empty.meals.title': 'No meals yet today',
  'empty.meals.body': 'Snap your plate and we will do the maths.',
  'empty.meals.action': 'Scan meal',
} as const;

export type MessageKey = keyof typeof en;

const hinglish: Partial<Record<MessageKey, string>> = {
  'common.looksRight': 'Sahi hai',
  'common.save': 'Save karo',
  'common.continue': 'Aage chalo',
  'portion.title': 'Ek baar check karo',
  'portion.subtitle': 'Kuch galat lage toh tap karke badlo.',
  'portion.allSet': 'Sab set — tumhara usual pata hai.',
  'report.title': 'Tumhara hafta',
  'report.proteinDays': 'din protein goal hit',
  'empty.meals.title': 'Aaj abhi tak kuch log nahi kiya',
  'empty.meals.body': 'Plate ki photo lo, hisaab hum karenge.',
  'empty.meals.action': 'Meal scan karo',
};

let current: Locale = 'en';
export const setLocale = (l: Locale) => {
  current = l;
};
export const getLocale = () => current;

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = (current === 'hinglish' && hinglish[key]) || en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
