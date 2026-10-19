import type { Exercise } from './api';

export const MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle back',
  'lower back',
  'traps',
  'abdominals',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
] as const;

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const isCardio = (e: Pick<Exercise, 'category'> | undefined) => e?.category === 'cardio';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Name/alias search with prefix matches first, then muscle/equipment filters. */
export function searchExercises(
  list: Exercise[],
  q: string,
  f: { muscle?: string | null; equipment?: string | null } = {},
): Exercise[] {
  const query = norm(q);
  const words = query.split(' ').filter(Boolean);
  const scored: { e: Exercise; score: number }[] = [];
  for (const e of list) {
    if (f.muscle && !e.primary_muscles.includes(f.muscle)) continue;
    if (f.equipment && e.equipment !== f.equipment) continue;
    if (!words.length) {
      scored.push({ e, score: e.owner_id ? -1 : 0 });
      continue;
    }
    const names = [e.name, ...e.aliases].map(norm);
    if (!words.every((w) => names.some((n) => n.includes(w)))) continue;
    const score = names.some((n) => n.startsWith(query)) ? 0 : names.some((n) => n.includes(query)) ? 1 : 2;
    scored.push({ e, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name)).map((x) => x.e);
}

export const fmtKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 100) / 100));
