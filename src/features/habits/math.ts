// server-shared: habit maths (docs/ARCHITECTURE.md "Habits, goals and preferences"). Pure and unit-tested.
import { addDays, istDay } from '../../lib/day.ts';

export type HabitKind = 'smoking' | 'water' | 'sleep' | 'alcohol' | 'junk' | 'sugar' | 'custom';
export type HabitLog = { logged_at: string; value: number };

/** Limit habits are "less is better" (a daily cap); the rest are goals to reach. */
export const isLimitHabit = (kind: HabitKind) => kind === 'smoking' || kind === 'alcohol' || kind === 'junk' || kind === 'sugar';

/** Sum of logged values per IST day. */
export function perDay(logs: HabitLog[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) {
    const d = istDay(new Date(l.logged_at));
    out.set(d, (out.get(d) ?? 0) + Number(l.value));
  }
  return out;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Smoke-free streak in whole days: days since the last logged cigarette (or since tracking started), not
 * counting today unless today is clean so far.
 */
export function smokeFreeDays(logs: HabitLog[], trackingSince: string, today: string): number {
  const smoked = [...perDay(logs)].filter(([, n]) => n > 0).map(([d]) => d);
  const last = smoked.sort().at(-1);
  if (last === today) return 0;
  const start = last ? addDays(last, 1) : istDay(new Date(trackingSince));
  return Math.max(0, daysBetween(start, today));
}

/** Cigarettes not smoked since tracking started: Σ max(0, baseline − smoked) over completed days (today included). */
export function cigarettesAvoided(logs: HabitLog[], baselinePerDay: number, trackingSince: string, today: string): number {
  if (!baselinePerDay) return 0;
  const days = perDay(logs);
  let avoided = 0;
  for (let d = istDay(new Date(trackingSince)); d <= today; d = addDays(d, 1)) {
    avoided += Math.max(0, baselinePerDay - (days.get(d) ?? 0));
  }
  return Math.round(avoided);
}

/** ₹ saved = cigarettes avoided × price per cigarette. */
export const moneySaved = (avoided: number, pricePerUnit: number | null) => Math.round(avoided * (pricePerUnit ?? 0));

/** Did this day meet the habit? Goals: value ≥ target. Limits: value ≤ target (target defaults to 0). */
export function dayMet(kind: HabitKind, value: number, target: number | null): boolean {
  if (isLimitHabit(kind)) return value <= (target ?? 0);
  return target ? value >= target : value > 0;
}

/**
 * Consecutive days the habit was met, ending today if today is already met, else ending yesterday.
 * Goal habits need a log to count; limit habits count a day with no log as met (only since tracking began).
 */
export function habitStreak(
  kind: HabitKind,
  logs: HabitLog[],
  target: number | null,
  trackingSince: string,
  today: string,
): number {
  const days = perDay(logs);
  const start = istDay(new Date(trackingSince));
  const met = (d: string) => dayMet(kind, days.get(d) ?? 0, target) && (isLimitHabit(kind) || days.has(d));
  let d = met(today) ? today : addDays(today, -1);
  let n = 0;
  while (d >= start && met(d) && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Average of logged days in the last `n` days (e.g. sleep hours over 7 days). */
export function recentAverage(logs: HabitLog[], today: string, n = 7): number | null {
  const days = perDay(logs);
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = days.get(addDays(today, -i));
    if (v !== undefined) vals.push(v);
  }
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

/** 0..1 adherence for the daily score. Limits lose credit as they go over; goals gain credit toward target. */
export function habitAdherence(kind: HabitKind, value: number, target: number | null): number {
  if (isLimitHabit(kind)) {
    const cap = target ?? 0;
    if (value <= cap) return 1;
    return Math.max(0, 1 - (value - cap) / Math.max(cap, 2));
  }
  if (!target) return value > 0 ? 1 : 0;
  return Math.min(1, value / target);
}
