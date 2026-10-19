// Trainer dashboard maths (docs/ARCHITECTURE.md "Trainer mode"): red-flag chips and planned-vs-done sessions.
import { addDays } from '@/lib/day';

export type DayIntake = { kcal: number; protein_g: number };
export type Flag =
  | { key: 'no_logs'; n: number }
  | { key: 'protein_short'; n: number }
  | { key: 'missed_sessions'; n: number }
  | { key: 'over_kcal'; n: number };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Monday of the IST week containing `day`. */
export const weekStart = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

/** Planned sessions from Monday up to and including `today` (0 = Sunday … 6 = Saturday). */
export function plannedSoFar(planWeekdays: number[], today: string): number {
  const start = weekStart(today);
  let n = 0;
  for (let d = start; d <= today; d = addDays(d, 1))
    if (planWeekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n++;
  return n;
}

/** Consecutive completed days (ending yesterday) where `test` holds; days without logs break the run. */
function runEndingYesterday(byDay: Map<string, DayIntake>, today: string, test: (d: DayIntake) => boolean) {
  let n = 0;
  for (let d = addDays(today, -1); n < 60; d = addDays(d, -1)) {
    const v = byDay.get(d);
    if (!v || !test(v)) break;
    n++;
  }
  return n;
}

/**
 * Chips for the clients list, worst first: no logs for 2+ days, protein under 80% of target for 3+ days in
 * a row, planned sessions missed this week, calories 20%+ over target for 3+ days.
 */
export function redFlags(o: {
  byDay: Map<string, DayIntake>;
  today: string;
  lastLogDay: string | null;
  kcalTarget: number;
  proteinTarget: number;
  planWeekdays: number[];
  workoutsThisWeek: number;
}): Flag[] {
  const flags: Flag[] = [];
  const quiet = o.lastLogDay ? daysBetween(o.lastLogDay, o.today) : null;
  if (quiet === null || quiet >= 2) flags.push({ key: 'no_logs', n: quiet ?? 0 });
  const short = runEndingYesterday(o.byDay, o.today, (d) => d.protein_g < o.proteinTarget * 0.8);
  if (short >= 3) flags.push({ key: 'protein_short', n: short });
  // Today's planned session isn't missed until the day is over.
  const yesterday = addDays(o.today, -1);
  const plannedBeforeToday = yesterday < weekStart(o.today) ? 0 : plannedSoFar(o.planWeekdays, yesterday);
  const missed = plannedBeforeToday - o.workoutsThisWeek;
  if (missed >= 1) flags.push({ key: 'missed_sessions', n: missed });
  const over = runEndingYesterday(o.byDay, o.today, (d) => d.kcal > o.kcalTarget * 1.2);
  if (over >= 3) flags.push({ key: 'over_kcal', n: over });
  return flags;
}

/** Days in the window whose calories landed within ±10% of target. */
export function adherentDays(byDay: Map<string, DayIntake>, days: string[], kcalTarget: number): number {
  return days.filter((d) => {
    const v = byDay.get(d);
    return !!v && Math.abs(v.kcal - kcalTarget) <= kcalTarget * 0.1;
  }).length;
}
