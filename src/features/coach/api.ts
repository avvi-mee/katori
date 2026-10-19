import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { profileKey, useProfile, type Profile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { groupByDay } from '@/features/personas/facts';
import { callFunction } from '@/lib/api';
import { addDays, istDay, istDayRange } from '@/lib/day';
import { supabase } from '@/lib/supabase';

const num = (v: unknown) => (v == null ? null : Number(v));

// ─── Client side ─────────────────────────────────────────────────────────────
export type MyCoach = { link_id: string; coach_id: string; coach_name: string; started_at: string };

export function useMyCoach() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['my_coach', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_coach');
      if (error) throw error;
      return ((data as MyCoach[] | null) ?? [])[0] ?? null;
    },
  });
}

export function useLeaveCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.rpc('end_coach_link', { link: linkId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my_coach'] });
      void qc.invalidateQueries({ queryKey: ['subscription'] });
    },
  });
}

export function useInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: ['invite_preview', code],
    enabled: !!code,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('coach_invite_preview', { code: code! });
      if (error) throw error;
      return ((data as { coach_name: string; valid: boolean }[] | null) ?? [])[0] ?? null;
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('accept_coach_invite', { code });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my_coach'] });
      void qc.invalidateQueries({ queryKey: ['subscription'] });
    },
  });
}

export type MealComment = {
  id: string;
  meal_id: string;
  author_id: string;
  body: string | null;
  reaction: Reaction | null;
  read_at: string | null;
  created_at: string;
};
export type Reaction = 'great' | 'protein' | 'portion' | 'oil' | 'veggies';
export const REACTIONS: Reaction[] = ['great', 'protein', 'portion', 'oil', 'veggies'];
export const REACTION_EMOJI: Record<Reaction, string> = {
  great: '👏',
  protein: '💪',
  portion: '🍽️',
  oil: '🫗',
  veggies: '🥗',
};

/** Comments on the given meals (both sides read them through RLS). */
export function useMealComments(mealIds: string[]) {
  const key = [...mealIds].sort().join(',');
  return useQuery({
    queryKey: ['meal_comments', key],
    enabled: mealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_comments')
        .select('id, meal_id, author_id, body, reaction, read_at, created_at')
        .in('meal_id', mealIds)
        .order('created_at');
      if (error) throw error;
      return data as MealComment[];
    },
  });
}

export function useMarkCommentsRead() {
  const qc = useQueryClient();
  return async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from('meal_comments').update({ read_at: new Date().toISOString() }).in('id', ids);
    void qc.invalidateQueries({ queryKey: ['meal_comments'] });
  };
}

// ─── Coach side ──────────────────────────────────────────────────────────────
export const useIsCoach = () => useProfile().data?.role === 'coach';

export function useBecomeCoach() {
  const uid = useSession((s) => s.session?.user.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc('become_coach', { display_name: name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey(uid) }),
  });
}

export function useInviteCode(enabled: boolean) {
  return useQuery({
    queryKey: ['coach_invite'],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('create_coach_invite');
      if (error) throw error;
      return data as string;
    },
  });
}

export type ClientRow = {
  link_id: string;
  started_at: string;
  profile: Profile;
  goals: { kcal: number | null; protein_g: number | null } | null;
};

/** Active clients with their profile and coach/engine targets. */
export function useClients() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['coach_clients', uid],
    enabled: !!uid,
    queryFn: async (): Promise<ClientRow[]> => {
      const { data: links, error } = await supabase
        .from('coach_clients')
        .select('id, client_id, started_at')
        .eq('coach_id', uid!)
        .eq('status', 'active')
        .order('started_at');
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.client_id as string);
      if (!ids.length) return [];
      const [{ data: profiles }, { data: goals }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', ids),
        supabase.from('goals').select('user_id, kcal, protein_g').in('user_id', ids),
      ]);
      return (links ?? []).flatMap((l) => {
        const profile = (profiles as Profile[] | null)?.find((p) => p.id === l.client_id);
        if (!profile) return [];
        const g = goals?.find((x) => x.user_id === l.client_id);
        return [
          {
            link_id: l.id,
            started_at: l.started_at,
            profile,
            goals: g ? { kcal: num(g.kcal), protein_g: num(g.protein_g) } : null,
          },
        ];
      });
    },
  });
}

export const clientTargets = (c: Pick<ClientRow, 'profile' | 'goals'>) => ({
  kcal: c.goals?.kcal ?? c.profile.kcal_target ?? 2000,
  protein: c.goals?.protein_g ?? c.profile.protein_target ?? 100,
});

/** Meals of the given clients over the last `days` days (for list summaries and flags). */
export function useClientsMeals(ids: string[], days = 14) {
  const today = istDay();
  return useQuery({
    queryKey: ['coach_meals', ids.join(','), today, days],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { from } = istDayRange(addDays(today, -(days - 1)));
      const { data, error } = await supabase
        .from('meals')
        .select('id, user_id, eaten_at, meal_type, kcal, protein_g')
        .in('user_id', ids)
        .gte('eaten_at', from)
        .order('eaten_at', { ascending: false });
      if (error) throw error;
      const byUser = new Map<
        string,
        { id: string; eaten_at: string; meal_type: string; kcal: number; protein_g: number }[]
      >();
      for (const m of data ?? [])
        byUser.set(m.user_id, [
          ...(byUser.get(m.user_id) ?? []),
          { ...m, kcal: Number(m.kcal), protein_g: Number(m.protein_g) },
        ]);
      return byUser;
    },
  });
}

export const intakeByDay = (meals: { eaten_at: string; kcal: number; protein_g: number }[] | undefined) =>
  groupByDay(meals ?? []);

/** Workouts (with sets) and plans of the given clients since `fromIso`. */
export function useClientsTraining(ids: string[], fromIso: string) {
  return useQuery({
    queryKey: ['coach_training', ids.join(','), fromIso.slice(0, 10)],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [{ data: workouts }, { data: plans }] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, user_id, name, started_at, duration_s, volume_kg')
          .in('user_id', ids)
          .gte('started_at', fromIso)
          .order('started_at', { ascending: false }),
        supabase
          .from('workout_templates')
          .select('id, owner_id, name, plan_weekdays, assigned_by_coach_id')
          .in('owner_id', ids)
          .not('assigned_by_coach_id', 'is', null),
      ]);
      return {
        workouts: (workouts ?? []).map((w) => ({ ...w, volume_kg: num(w.volume_kg) })) as {
          id: string;
          user_id: string;
          name: string | null;
          started_at: string;
          duration_s: number | null;
          volume_kg: number | null;
        }[],
        plans: (plans ?? []) as { id: string; owner_id: string; name: string; plan_weekdays: number[] | null }[],
      };
    },
  });
}

export function useCoachComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { meal_id: string; body?: string; reaction?: Reaction }) =>
      callFunction<{ comment: MealComment }>('coach-comment', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_comments'] }),
  });
}

export function useSetClientTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { clientId: string; kcal: number | null; protein_g: number | null }) => {
      const { error } = await supabase
        .from('goals')
        .upsert(
          { user_id: o.clientId, kcal: o.kcal, protein_g: o.protein_g, updated_by: 'coach' },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach_clients'] }),
  });
}

export type BillingRow = {
  period: string;
  active_clients: number;
  amount: number;
  status: 'due' | 'covered' | 'unpaid';
};

export function useCoachBilling() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['coach_billing', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_billing')
        .select('period, active_clients, amount, status')
        .order('period', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as BillingRow[];
    },
  });
}

export const PRICE_PER_CLIENT = 99;

/** Everything the client detail screen shows, in one round of parallel reads (RLS limits it to active clients). */
export function useClientDetail(clientId: string | undefined) {
  const today = istDay();
  return useQuery({
    queryKey: ['coach_client', clientId, today],
    enabled: !!clientId,
    queryFn: async () => {
      const id = clientId!;
      const since = (days: number) => istDayRange(addDays(today, -(days - 1))).from;
      const [profile, goals, meals, weights, workouts, prs, activity, habits, plans] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', id).maybeSingle(),
        supabase
          .from('meals')
          .select(
            'id, eaten_at, meal_type, photo_path, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, meal_items(dish, unit, qty)',
          )
          .eq('user_id', id)
          .gte('eaten_at', since(14))
          .order('eaten_at', { ascending: false }),
        supabase
          .from('weights')
          .select('date, weight_kg')
          .eq('user_id', id)
          .gte('date', addDays(today, -90))
          .order('date'),
        supabase
          .from('workouts')
          .select('id, name, started_at, duration_s, volume_kg, template_id')
          .eq('user_id', id)
          .gte('started_at', since(28))
          .order('started_at', { ascending: false }),
        supabase
          .from('personal_records')
          .select('exercise_id, kind, value, kg, reps, achieved_at, exercises(name)')
          .eq('user_id', id)
          .neq('kind', 'volume')
          .gte('achieved_at', since(30))
          .order('achieved_at', { ascending: false })
          .limit(10),
        supabase.from('activity_days').select('date, steps').eq('user_id', id).gte('date', addDays(today, -6)),
        supabase
          .from('habits')
          .select('id, kind, name, unit, daily_target, created_at, active, habit_logs(logged_at, value)')
          .eq('user_id', id)
          .eq('active', true),
        supabase
          .from('workout_templates')
          .select(
            'id, name, plan_weekdays, assigned_by_coach_id, template_exercises(exercise_id, position, sets, rep_min, rep_max, rest_s)',
          )
          .eq('owner_id', id)
          .not('assigned_by_coach_id', 'is', null),
      ]);
      if (profile.error) throw profile.error;
      if (!profile.data) return null;
      return {
        profile: profile.data as Profile,
        goals: goals.data as { kcal: number | null; protein_g: number | null; updated_by: string } | null,
        meals: ((meals.data ?? []) as Record<string, unknown>[]).map((m) => ({
          ...(m as {
            id: string;
            eaten_at: string;
            meal_type: string;
            photo_path: string | null;
            meal_items: { dish: string; unit: string; qty: number }[];
          }),
          kcal: Number(m.kcal),
          kcal_low: Number(m.kcal_low),
          kcal_high: Number(m.kcal_high),
          protein_g: Number(m.protein_g),
          carbs_g: Number(m.carbs_g),
          fat_g: Number(m.fat_g),
        })),
        weights: (weights.data ?? []).map((w) => ({ date: w.date as string, weight_kg: Number(w.weight_kg) })),
        workouts: (workouts.data ?? []).map((w) => ({ ...w, volume_kg: num(w.volume_kg) })) as {
          id: string;
          name: string | null;
          started_at: string;
          duration_s: number | null;
          volume_kg: number | null;
          template_id: string | null;
        }[],
        prs: (prs.data ?? []) as unknown as {
          exercise_id: string;
          kind: string;
          value: number;
          kg: number | null;
          reps: number | null;
          achieved_at: string;
          exercises: { name: string } | null;
        }[],
        activity: (activity.data ?? []) as { date: string; steps: number }[],
        habits: (habits.data ?? []) as unknown as {
          id: string;
          kind: 'smoking' | 'water' | 'sleep' | 'alcohol' | 'junk' | 'sugar' | 'custom';
          name: string;
          unit: string;
          daily_target: number | null;
          created_at: string;
          habit_logs: { logged_at: string; value: number }[];
        }[],
        plans: (plans.data ?? []) as unknown as {
          id: string;
          name: string;
          plan_weekdays: number[] | null;
          template_exercises: {
            exercise_id: string;
            position: number;
            sets: number;
            rep_min: number;
            rep_max: number;
            rest_s: number;
          }[];
        }[],
      };
    },
  });
}
