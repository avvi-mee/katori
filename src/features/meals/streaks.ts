import { addDays } from '@/lib/day';

export type DayStat = { kcal: number; protein_g: number; meals: number };

/** The last `n` IST days ending today, oldest first. */
export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/**
 * Consecutive days with protein ≥ target. Today counts if already hit; if not, the streak is still alive
 * from yesterday (the day isn't over).
 */
export function proteinStreak(byDay: Map<string, DayStat>, today: string, proteinTarget: number): number {
  const hit = (d: string) => (byDay.get(d)?.protein_g ?? 0) >= proteinTarget;
  let d = hit(today) ? today : addDays(today, -1);
  let n = 0;
  while (hit(d) && n < 3650) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export type WeekSummary = { avgKcal: number; proteinDays: boolean[]; loggedDays: number; hitDays: number };

/** Average over days that have logs (an unlogged day isn't a 0-kcal day). */
export function weekSummary(byDay: Map<string, DayStat>, days: string[], proteinTarget: number): WeekSummary {
  const logged = days.map((d) => byDay.get(d)).filter((s): s is DayStat => !!s && s.meals > 0);
  const proteinDays = days.map((d) => (byDay.get(d)?.protein_g ?? 0) >= proteinTarget);
  return {
    avgKcal: logged.length ? logged.reduce((a, s) => a + s.kcal, 0) / logged.length : 0,
    proteinDays,
    loggedDays: logged.length,
    hitDays: proteinDays.filter(Boolean).length,
  };
}
