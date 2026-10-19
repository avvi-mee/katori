import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/features/auth/session';
import { addDays, istDay } from '@/lib/day';
import { num, upsertRows, useTable, type Row } from '@/lib/localRows';
import { supabase } from '@/lib/supabase';

import type { HistorySet, SetKind } from './math';

export type Exercise = {
  id: string;
  slug: string | null;
  name: string;
  aliases: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  mechanic: string | null;
  category: string;
  images: string[];
  owner_id: string | null;
};
export type Template = {
  id: string;
  owner_id: string | null;
  name: string;
  split: string | null;
  notes: string | null;
  position: number;
  /** Set when a trainer assigned this plan (Phase 2); plan_weekdays schedules it. */
  assigned_by_coach_id?: string | null;
  plan_weekdays?: number[] | null;
};
export type TemplateExercise = {
  template_id: string;
  position: number;
  exercise_id: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_s: number;
};
export type Workout = {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  volume_kg: number | null;
  notes: string | null;
  kcal_low: number | null;
  kcal_high: number | null;
  pending?: boolean;
};
export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_no: number;
  kind: SetKind;
  kg: number | null;
  reps: number | null;
  rpe: number | null;
  superset_group: number | null;
  duration_s: number | null;
  distance_m: number | null;
  done_at: string;
};

const DAY = 24 * 3600_000;
// shortcut: history (for "last time", offline PRs and charts) is the last year; page further back if anyone asks.
const since = () => new Date(Date.now() - 365 * DAY).toISOString();

/** Library + custom exercises, without instructions (≈900 rows, cached a day so the picker works offline). */
export function useExercises() {
  return useTable<Exercise>(
    'exercises',
    (q) =>
      q
        .select(
          'id, slug, name, aliases, primary_muscles, secondary_muscles, equipment, mechanic, category, images, owner_id',
        )
        .order('name'),
    undefined,
    DAY,
  );
}

export function useExerciseMap() {
  const { data } = useExercises();
  return useMemo(() => new Map((data ?? []).map((e) => [e.id, e])), [data]);
}

/** One exercise's instructions, fetched when its detail sheet opens. */
export function useExerciseInstructions(id: string | null) {
  return useQuery({
    queryKey: ['exercise_instructions', id],
    enabled: !!id,
    staleTime: 7 * DAY,
    queryFn: async () => {
      const { data, error } = await supabase.from('exercises').select('instructions').eq('id', id!).single();
      if (error) throw error;
      return (data as { instructions: string[] }).instructions;
    },
  });
}

export function useTemplates() {
  const templates = useTable<Template>('workout_templates', (q) => q.select('*').order('position'), undefined, DAY);
  const items = useTable<TemplateExercise>('template_exercises', (q) => q.select('*'), undefined, DAY);
  const data = useMemo(
    () =>
      templates.data?.map((t) => ({
        ...t,
        exercises: (items.data ?? []).filter((i) => i.template_id === t.id).sort((a, b) => a.position - b.position),
      })),
    [templates.data, items.data],
  );
  return { data, isLoading: templates.isLoading || items.isLoading };
}
export type TemplateWithExercises = NonNullable<ReturnType<typeof useTemplates>['data']>[number];

const normWorkout = (r: Row) =>
  ({
    ...r,
    volume_kg: num(r.volume_kg),
    duration_s: num(r.duration_s),
    kcal_low: num(r.kcal_low),
    kcal_high: num(r.kcal_high),
  }) as Workout;
const normSet = (r: Row) => ({ ...r, kg: num(r.kg), rpe: num(r.rpe) }) as WorkoutSet;

/** The last year of workouts (newest first) with their sets, including ones still waiting to sync. */
export function useWorkouts() {
  const w = useTable<Workout>(
    'workouts',
    (q) => q.select('*').gte('started_at', since()).order('started_at', { ascending: false }),
    normWorkout,
  );
  const s = useTable<WorkoutSet>(
    'workout_sets',
    (q) => q.select('*').gte('done_at', since()).order('done_at'),
    normSet,
  );
  const data = useMemo(() => {
    if (!w.data) return undefined;
    const byWorkout = new Map<string, WorkoutSet[]>();
    for (const set of s.data ?? []) byWorkout.set(set.workout_id, [...(byWorkout.get(set.workout_id) ?? []), set]);
    return [...w.data]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map((wk) => ({
        ...wk,
        sets: (byWorkout.get(wk.id) ?? []).sort((a, b) => a.done_at.localeCompare(b.done_at)),
      }));
  }, [w.data, s.data]);
  return { data, isLoading: w.isLoading || s.isLoading };
}
export type WorkoutWithSets = NonNullable<ReturnType<typeof useWorkouts>['data']>[number];

/** Every logged set of an exercise in other workouts, oldest first (history for hints and PRs). */
export const historyFor = (workouts: WorkoutWithSets[], exerciseId: string, excludeWorkout?: string): HistorySet[] =>
  workouts
    .filter((w) => w.id !== excludeWorkout)
    .flatMap((w) => w.sets.filter((s) => s.exercise_id === exerciseId))
    .sort((a, b) => a.done_at.localeCompare(b.done_at));

/** The most recent other session's sets of an exercise (workouts are newest first). */
export function lastSession(workouts: WorkoutWithSets[], exerciseId: string, excludeWorkout?: string) {
  for (const w of workouts) {
    if (w.id === excludeWorkout) continue;
    const sets = w.sets.filter((s) => s.exercise_id === exerciseId);
    if (sets.length) return { workout: w, sets };
  }
  return null;
}

export function useWorkoutsOn(day: string) {
  const { data } = useWorkouts();
  return useMemo(() => data?.filter((w) => istDay(new Date(w.started_at)) === day) ?? [], [data, day]);
}

/** Monday-to-today workouts. */
export function useWorkoutsThisWeek(today = istDay()) {
  const { data } = useWorkouts();
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  return useMemo(() => data?.filter((w) => istDay(new Date(w.started_at)) >= monday) ?? [], [data, monday]);
}

export type PersonalRecord = {
  id: string;
  exercise_id: string;
  kind: 'weight' | 'reps' | 'e1rm' | 'volume';
  value: number;
  kg: number | null;
  reps: number | null;
  workout_id: string;
  achieved_at: string;
};

/** Records written by the server trigger (online; the finish screen computes its own offline). */
export function usePersonalRecords() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['personal_records', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personal_records')
        .select('id, exercise_id, kind, value, kg, reps, workout_id, achieved_at')
        .order('achieved_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as Row[]).map((r) => ({ ...r, value: Number(r.value), kg: num(r.kg) }) as PersonalRecord);
    },
  });
}

/** Create a custom exercise (offline-safe). */
export function useCreateExercise() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return async (e: { name: string; primary_muscles: string[]; equipment: string | null; category?: string }) => {
    const row: Exercise & { source: 'custom' } = {
      id: crypto.randomUUID(),
      slug: null,
      name: e.name.trim().slice(0, 120),
      aliases: [],
      primary_muscles: e.primary_muscles,
      secondary_muscles: [],
      equipment: e.equipment,
      mechanic: null,
      category: e.category ?? 'strength',
      images: [],
      source: 'custom',
      owner_id: uid!,
    };
    await upsertRows(qc, 'exercises', [row]);
    return row;
  };
}
