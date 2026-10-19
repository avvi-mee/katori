// server-shared: workout maths from docs/ARCHITECTURE.md "Workout tracker". Pure and unit-tested.

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure';
export type LoggedSet = { kind: SetKind; kg: number | null; reps: number | null; rpe?: number | null };

/** Epley estimated one-rep max: kg × (1 + reps / 30). */
export const e1rm = (kg: number, reps: number): number => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);

const counts = (s: LoggedSet) => s.kind !== 'warmup' && (s.kg ?? 0) > 0 && (s.reps ?? 0) > 0;

/** Total volume (kg × reps) of non-warm-up sets. */
export const volume = (sets: LoggedSet[]): number =>
  sets.filter(counts).reduce((sum, s) => sum + (s.kg ?? 0) * (s.reps ?? 0), 0);

/** Best e1RM in a list of sets (0 when none count). */
export const bestE1rm = (sets: LoggedSet[]): number =>
  Math.max(0, ...sets.filter(counts).map((s) => e1rm(s.kg!, s.reps!)));

const LOWER = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower back']);

/** Lower-body lifts progress by 5 kg, upper-body by 2.5 kg (by the exercise's primary muscles). */
export const isLowerBody = (primaryMuscles: string[]) => primaryMuscles.some((m) => LOWER.has(m));

export type ProgressionHint = { addKg: number; nextKg: number } | null;

/**
 * If every working set hit the top of the rep range at RPE ≤ 8, suggest +2.5 kg (upper) / +5 kg (lower) next
 * time. A set without RPE counts as fine (most people don't log RPE).
 */
export function progressionHint(sets: LoggedSet[], repMax: number, primaryMuscles: string[]): ProgressionHint {
  const working = sets.filter((s) => s.kind === 'working' && (s.kg ?? 0) > 0);
  if (!working.length) return null;
  const allTop = working.every((s) => (s.reps ?? 0) >= repMax && (s.rpe == null || s.rpe <= 8));
  if (!allTop) return null;
  const addKg = isLowerBody(primaryMuscles) ? 5 : 2.5;
  const topKg = Math.max(...working.map((s) => s.kg!));
  return { addKg, nextKg: topKg + addKg };
}

/** Deload hint: best e1RM dropped for 3 sessions in a row (sessions oldest → newest). */
export function deloadHint(sessionBestE1rms: number[]): boolean {
  const s = sessionBestE1rms.filter((v) => v > 0);
  if (s.length < 4) return false;
  const [a, b, c, d] = s.slice(-4) as [number, number, number, number];
  return b < a && c < b && d < c;
}

/** "60 kg × 8, 8, 7" — the last session's working sets, for the ghost row. */
export function lastTimeSummary(sets: LoggedSet[]): string | null {
  const working = sets.filter(counts);
  if (!working.length) return null;
  const kgs = [...new Set(working.map((s) => s.kg))];
  if (kgs.length === 1) return `${fmtKg(kgs[0]!)} kg × ${working.map((s) => s.reps).join(', ')}`;
  return working.map((s) => `${fmtKg(s.kg!)}×${s.reps}`).join(', ');
}

const fmtKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(/\.0$/, ''));

/** Unique primary muscles of the exercises that got at least one counted set. */
export function musclesHit(exercises: { primary_muscles: string[]; sets: LoggedSet[] }[]): string[] {
  return [...new Set(exercises.filter((e) => e.sets.some(counts)).flatMap((e) => e.primary_muscles))];
}

export type KcalRange = { low: number; high: number };

/** Strength-session burn from duration (MET 3.5–6), shown as a range and kept out of food targets by default. */
export function workoutKcal(durationS: number, bodyKg: number): KcalRange {
  const h = Math.max(0, durationS) / 3600;
  return { low: Math.round(3.5 * bodyKg * h), high: Math.round(6 * bodyKg * h) };
}

export type RunKind = 'run' | 'walk' | 'cycle';
const KCAL_PER_KG_KM: Record<RunKind, [number, number]> = { run: [0.9, 1.1], walk: [0.5, 0.7], cycle: [0.25, 0.35] };

/** Pace in seconds per km. */
export const paceSecPerKm = (distanceM: number, durationS: number) =>
  distanceM > 0 ? (durationS / distanceM) * 1000 : 0;

export const formatPace = (secPerKm: number) => {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
};

/** Run / walk / ride burn from distance and body weight, as a range. */
export function runKcal(kind: RunKind, distanceM: number, bodyKg: number): KcalRange {
  const km = Math.max(0, distanceM) / 1000;
  const [lo, hi] = KCAL_PER_KG_KM[kind];
  return { low: Math.round(lo * bodyKg * km), high: Math.round(hi * bodyKg * km) };
}

export const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

export type PrKind = 'weight' | 'reps' | 'e1rm' | 'volume';
export type HistorySet = LoggedSet & { exercise_id: string; workout_id: string };
export type PrHit = { exercise_id: string; kind: PrKind; value: number; kg: number | null; reps: number | null };

/**
 * The PRs a session sets against history, mirroring the database trigger (20261016000300_pr_trigger.sql) so
 * the finish screen can show them offline. Best hit per exercise and kind; the very first working set of an
 * exercise is a baseline.
 */
export function detectPrs(history: HistorySet[], session: HistorySet[]): PrHit[] {
  const seen = history.filter(counts);
  const best = new Map<string, PrHit>();
  const hit = (h: PrHit) => {
    const k = `${h.exercise_id}|${h.kind}`;
    if (!best.has(k) || best.get(k)!.value < h.value) best.set(k, h);
  };
  for (const s of session.filter(counts)) {
    const prior = seen.filter((p) => p.exercise_id === s.exercise_id);
    if (prior.length) {
      const kg = s.kg!;
      const reps = s.reps!;
      if (kg > Math.max(...prior.map((p) => p.kg!)))
        hit({ exercise_id: s.exercise_id, kind: 'weight', value: kg, kg, reps });
      const atKg = prior.filter((p) => p.kg === kg).map((p) => p.reps!);
      if (atKg.length && reps > Math.max(...atKg))
        hit({ exercise_id: s.exercise_id, kind: 'reps', value: reps, kg, reps });
      const e = Math.round(e1rm(kg, reps) * 100) / 100;
      if (e > Math.max(...prior.map((p) => e1rm(p.kg!, p.reps!))))
        hit({ exercise_id: s.exercise_id, kind: 'e1rm', value: e, kg, reps });
    }
    seen.push(s);
  }
  // Session volume per exercise vs the best earlier workout.
  for (const ex of new Set(session.map((s) => s.exercise_id))) {
    const byWorkout = new Map<string, number>();
    for (const p of history)
      if (p.exercise_id === ex && counts(p))
        byWorkout.set(p.workout_id, (byWorkout.get(p.workout_id) ?? 0) + p.kg! * p.reps!);
    if (!byWorkout.size) continue;
    const v = volume(session.filter((s) => s.exercise_id === ex));
    if (v > Math.max(...byWorkout.values())) hit({ exercise_id: ex, kind: 'volume', value: v, kg: null, reps: null });
  }
  return [...best.values()];
}

type SessionLike = { started_at: string; sets: (LoggedSet & { exercise_id: string })[] };

/** Best e1RM per session for one lift, oldest first (the Progress strength chart). */
export function e1rmSeries(workouts: SessionLike[], exerciseId: string): { date: string; value: number }[] {
  return workouts
    .map((w) => ({ date: w.started_at, value: bestE1rm(w.sets.filter((s) => s.exercise_id === exerciseId)) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ ...p, value: Math.round(p.value * 10) / 10 }));
}

/** Working sets and volume per primary muscle for workouts since `fromIso` (Pro analytics). */
export function volumePerMuscle(
  workouts: SessionLike[],
  musclesOf: (exerciseId: string) => string[],
  fromIso: string,
): { muscle: string; sets: number; volume: number }[] {
  const out = new Map<string, { sets: number; volume: number }>();
  for (const w of workouts) {
    if (w.started_at < fromIso) continue;
    for (const s of w.sets.filter(counts)) {
      for (const m of musclesOf(s.exercise_id)) {
        const cur = out.get(m) ?? { sets: 0, volume: 0 };
        out.set(m, { sets: cur.sets + 1, volume: cur.volume + s.kg! * s.reps! });
      }
    }
  }
  return [...out].map(([muscle, v]) => ({ muscle, ...v })).sort((a, b) => b.sets - a.sets || b.volume - a.volume);
}
