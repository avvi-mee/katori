// The live workout: held on the device (Zustand persisted to IndexedDB) until Finish, so a gym with no
// signal, a reload or a closed tab never loses a set. Finish turns it into workouts + workout_sets rows
// that go through the outbox.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { idbStorage } from '@/lib/storage';

import { volume, workoutKcal, type SetKind } from './math';

export type LiveSet = {
  id: string;
  kind: SetKind;
  kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_s: number | null;
  distance_m: number | null;
  done_at: string | null;
};
export type LiveExercise = {
  key: string;
  exercise_id: string;
  rep_min: number;
  rep_max: number;
  rest_s: number;
  superset_group: number | null;
  sets: LiveSet[];
};
export type LiveWorkout = {
  id: string;
  name: string;
  template_id: string | null;
  started_at: string;
  exercises: LiveExercise[];
};
export type Rest = { ends_at: number; total_s: number };

export type Plan = { exercise_id: string; sets?: number; rep_min?: number; rep_max?: number; rest_s?: number };

const newSet = (kind: SetKind = 'working'): LiveSet => ({
  id: crypto.randomUUID(),
  kind,
  kg: null,
  reps: null,
  rpe: null,
  duration_s: null,
  distance_m: null,
  done_at: null,
});

const toExercise = (p: Plan, defaultRest: number): LiveExercise => ({
  key: crypto.randomUUID(),
  exercise_id: p.exercise_id,
  rep_min: p.rep_min ?? 8,
  rep_max: p.rep_max ?? 12,
  rest_s: p.rest_s ?? defaultRest,
  superset_group: null,
  sets: Array.from({ length: Math.max(1, p.sets ?? 3) }, () => newSet()),
});

type State = {
  live: LiveWorkout | null;
  rest: Rest | null;
  start(o: { name: string; template_id?: string | null; plan?: Plan[]; defaultRest?: number }): void;
  addExercises(plans: Plan[], defaultRest?: number): void;
  removeExercise(key: string): void;
  moveExercise(key: string, by: -1 | 1): void;
  setRestFor(key: string, rest_s: number): void;
  toggleSuperset(key: string): void;
  addSet(key: string): void;
  removeSet(key: string, setId: string): void;
  updateSet(key: string, setId: string, patch: Partial<LiveSet>): void;
  /** Tick a set (filling empty fields from `fallback`, the ghost values) or untick it. Ticking starts the rest timer. */
  toggleDone(key: string, setId: string, fallback?: { kg: number | null; reps: number | null }, now?: number): void;
  rename(name: string): void;
  skipRest(): void;
  addRest(s: number): void;
  discard(): void;
};

const mapEx = (live: LiveWorkout, key: string, f: (e: LiveExercise) => LiveExercise): LiveWorkout => ({
  ...live,
  exercises: live.exercises.map((e) => (e.key === key ? f(e) : e)),
});

export const useLiveWorkout = create<State>()(
  persist(
    (set, get) => ({
      live: null,
      rest: null,
      start: ({ name, template_id = null, plan = [], defaultRest = 90 }) =>
        set({
          rest: null,
          live: {
            id: crypto.randomUUID(),
            name,
            template_id,
            started_at: new Date().toISOString(),
            exercises: plan.map((p) => toExercise(p, defaultRest)),
          },
        }),
      addExercises: (plans, defaultRest = 90) => {
        const live = get().live;
        if (live)
          set({ live: { ...live, exercises: [...live.exercises, ...plans.map((p) => toExercise(p, defaultRest))] } });
      },
      removeExercise: (key) => {
        const live = get().live;
        if (live) set({ live: { ...live, exercises: live.exercises.filter((e) => e.key !== key) } });
      },
      moveExercise: (key, by) => {
        const live = get().live;
        if (!live) return;
        const i = live.exercises.findIndex((e) => e.key === key);
        const j = i + by;
        if (i < 0 || j < 0 || j >= live.exercises.length) return;
        const exercises = [...live.exercises];
        [exercises[i], exercises[j]] = [exercises[j]!, exercises[i]!];
        set({ live: { ...live, exercises } });
      },
      setRestFor: (key, rest_s) => {
        const live = get().live;
        if (live) set({ live: mapEx(live, key, (e) => ({ ...e, rest_s })) });
      },
      // Links an exercise with the next one (A1/A2); tapping again unlinks it.
      toggleSuperset: (key) => {
        const live = get().live;
        if (!live) return;
        const i = live.exercises.findIndex((e) => e.key === key);
        const cur = live.exercises[i];
        const next = live.exercises[i + 1];
        if (!cur) return;
        if (cur.superset_group != null) {
          const g = cur.superset_group;
          set({
            live: {
              ...live,
              exercises: live.exercises.map((e) => (e.superset_group === g ? { ...e, superset_group: null } : e)),
            },
          });
          return;
        }
        if (!next) return;
        const g = next.superset_group ?? Math.max(0, ...live.exercises.map((e) => e.superset_group ?? 0)) + 1;
        set({
          live: {
            ...live,
            exercises: live.exercises.map((e, k) => (k === i || k === i + 1 ? { ...e, superset_group: g } : e)),
          },
        });
      },
      addSet: (key) => {
        const live = get().live;
        if (!live) return;
        set({
          live: mapEx(live, key, (e) => {
            const last = e.sets.at(-1);
            return {
              ...e,
              sets: [
                ...e.sets,
                { ...newSet(last?.kind === 'warmup' ? 'working' : (last?.kind ?? 'working')), kg: last?.kg ?? null },
              ],
            };
          }),
        });
      },
      removeSet: (key, setId) => {
        const live = get().live;
        if (live) set({ live: mapEx(live, key, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })) });
      },
      updateSet: (key, setId, patch) => {
        const live = get().live;
        if (live)
          set({
            live: mapEx(live, key, (e) => ({
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            })),
          });
      },
      toggleDone: (key, setId, fallback, now = Date.now()) => {
        const live = get().live;
        if (!live) return;
        const ex = live.exercises.find((e) => e.key === key);
        const target = ex?.sets.find((s) => s.id === setId);
        if (!ex || !target) return;
        const done = !target.done_at;
        set({
          live: mapEx(live, key, (e) => ({
            ...e,
            sets: e.sets.map((s) =>
              s.id !== setId
                ? s
                : done
                  ? {
                      ...s,
                      kg: s.kg ?? fallback?.kg ?? null,
                      reps: s.reps ?? fallback?.reps ?? null,
                      done_at: new Date(now).toISOString(),
                    }
                  : { ...s, done_at: null },
            ),
          })),
        });
        if (!done) return;
        // Supersets rest only after the last exercise of the group.
        const group = ex.superset_group;
        const members = group == null ? [] : live.exercises.filter((e) => e.superset_group === group);
        if (members.length && members.at(-1)!.key !== key) return;
        if (ex.rest_s > 0) set({ rest: { ends_at: now + ex.rest_s * 1000, total_s: ex.rest_s } });
      },
      rename: (name) => {
        const live = get().live;
        if (live) set({ live: { ...live, name: name.slice(0, 80) } });
      },
      skipRest: () => set({ rest: null }),
      addRest: (s) => {
        const rest = get().rest;
        if (rest) set({ rest: { ends_at: rest.ends_at + s * 1000, total_s: rest.total_s + s } });
      },
      discard: () => set({ live: null, rest: null }),
    }),
    { name: 'katori-live-workout', storage: createJSONStorage(() => idbStorage), version: 1 },
  ),
);

/** Completed sets with something logged. Cardio sets count with duration or distance. */
const isLogged = (s: LiveSet) =>
  !!s.done_at && ((s.kg ?? 0) > 0 || (s.reps ?? 0) > 0 || (s.duration_s ?? 0) > 0 || (s.distance_m ?? 0) > 0);

/** Turns the live workout into rows. Returns null when nothing was completed. */
export function finishRows(live: LiveWorkout, userId: string, bodyKg: number | null, now = Date.now()) {
  const ended_at = new Date(now).toISOString();
  const sets = live.exercises.flatMap((e) => {
    let n = 0;
    return e.sets.filter(isLogged).map((s) => ({
      id: s.id,
      workout_id: live.id,
      exercise_id: e.exercise_id,
      set_no: Math.min(100, ++n),
      kind: s.kind,
      kg: s.kg,
      reps: s.reps,
      rpe: s.rpe,
      superset_group: e.superset_group,
      duration_s: s.duration_s,
      distance_m: s.distance_m,
      done_at: s.done_at!,
    }));
  });
  if (!sets.length) return null;
  const duration_s = Math.min(86_400, Math.max(0, Math.round((now - Date.parse(live.started_at)) / 1000)));
  const kcal = workoutKcal(duration_s, bodyKg ?? 70);
  const workout = {
    id: live.id,
    user_id: userId,
    template_id: live.template_id,
    name: live.name || null,
    started_at: live.started_at,
    ended_at,
    duration_s,
    volume_kg: Math.round(volume(sets) * 10) / 10,
    notes: null,
    kcal_low: kcal.low,
    kcal_high: kcal.high,
  };
  return { workout, sets };
}
