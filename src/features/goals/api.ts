import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useProfile, useUpdateProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { stepsOn, useActivityDays, useRuns } from '@/features/activity/api';
import { useHabitsToday } from '@/features/habits/api';
import { useDayMeals } from '@/features/meals/api';
import { useWorkoutsOn } from '@/features/workouts/api';
import { runKcal } from '@/features/workouts/math';
import { istDay } from '@/lib/day';
import { upsertRows, useTable, type Row } from '@/lib/localRows';
import { parsePreferences, type Preferences } from '@/types/preferences';

import { dailyScore, dailyTargets, trainingWeekdays, type GoalsRow } from './engine';

export type Goals = GoalsRow & {
  user_id: string;
  primary_goal: string | null;
  updated_by: 'user' | 'engine' | 'coach';
  updated_at?: string;
};

export function useGoalsRow() {
  const q = useTable<Goals>(
    'goals',
    (b) => b.select('*'),
    (r: Row) => ({ ...r, sleep_h: r.sleep_h == null ? null : Number(r.sleep_h) }) as Goals,
  );
  return { ...q, data: q.data?.[0] ?? null };
}

export function useSaveGoals() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return (patch: Partial<Goals>) => upsertRows(qc, 'goals', [{ user_id: uid!, ...patch, updated_by: 'user' }]);
}

export function usePreferences(): Preferences {
  const { data } = useProfile();
  return useMemo(() => parsePreferences(data?.preferences), [data?.preferences]);
}

export function useSavePreferences() {
  const { data } = useProfile();
  const update = useUpdateProfile();
  return (patch: Partial<Preferences>) =>
    update.mutateAsync({ preferences: { ...parsePreferences(data?.preferences), ...patch } });
}

/** Today's targets from the goals row, the profile and preferences (plus today's burn, if opted in). */
export function useTargets() {
  const { data: profile } = useProfile();
  const { data: goals } = useGoalsRow();
  const prefs = usePreferences();
  const today = istDay();
  const workouts = useWorkoutsOn(today);
  const { data: runs } = useRuns();
  return useMemo(() => {
    const base = dailyTargets(
      {
        kcal_target: profile?.kcal_target ?? null,
        protein_target: profile?.protein_target ?? null,
        weight_kg: profile?.weight_kg ?? null,
      },
      goals,
      prefs.training_days,
    );
    if (!prefs.add_burn_to_targets) return base;
    // Midpoint of each estimated range; off by default because burn estimates run high.
    const kg = profile?.weight_kg ?? 70;
    const burn =
      workouts.reduce((a, w) => a + ((w.kcal_low ?? 0) + (w.kcal_high ?? 0)) / 2, 0) +
      (runs ?? [])
        .filter((r) => istDay(new Date(r.started_at)) === today)
        .reduce((a, r) => {
          const k = runKcal(r.kind, r.distance_m, kg);
          return a + (k.low + k.high) / 2;
        }, 0);
    return { ...base, kcal: Math.round(base.kcal + burn) };
  }, [profile, goals, prefs.training_days, prefs.add_burn_to_targets, workouts, runs, today]);
}

/** Is `day` one of the user's training days? */
export function useIsTrainingDay(day = istDay()) {
  const prefs = usePreferences();
  return trainingWeekdays(prefs).includes(new Date(`${day}T00:00:00Z`).getUTCDay());
}

/** The 0–100 daily score and what moved it, from every tracker. */
export function useDailyScore(day = istDay()) {
  const targets = useTargets();
  const meals = useDayMeals(day);
  const workouts = useWorkoutsOn(day);
  const { data: activity } = useActivityDays();
  const habits = useHabitsToday(day);
  const trainingDay = useIsTrainingDay(day);
  return useMemo(() => {
    const rows = meals.data ?? [];
    return dailyScore({
      targets,
      food: {
        kcal: rows.reduce((a, m) => a + m.kcal, 0),
        protein_g: rows.reduce((a, m) => a + m.protein_g, 0),
        meals: rows.length,
      },
      trainingDay,
      workoutsDone: workouts.length,
      steps: stepsOn(activity, day),
      habits: (habits ?? []).map((h) => ({ name: h.habit.name, adherence: h.adherence })),
    });
  }, [targets, meals.data, workouts.length, activity, habits, trainingDay, day]);
}
