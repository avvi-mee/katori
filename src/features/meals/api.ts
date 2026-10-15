import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { groupByDay } from '@/features/personas/facts';
import type { PersonaId } from '@/features/personas/personas';
import type { Food } from '@/features/portions/engine';
import { track } from '@/lib/analytics';
import { callFunction } from '@/lib/api';
import { addDays, istDayRange } from '@/lib/day';
import { supabase } from '@/lib/supabase';
import type { ConfirmResponse } from '@/types/api';
import type { Answer, MealSource, MealType, OilLevel, Unit } from '@/types/meal';

export type FoodRow = Food & { slug: string; aliases: string[]; kind: 'dish' | 'ingredient' | 'packaged' };

export type MealRow = {
  id: string;
  eaten_at: string;
  meal_type: MealType;
  source: MealSource;
  input_mode: string;
  photo_path: string | null;
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_items: { id: string; dish: string; unit: Unit; qty: number; kcal: number; protein_g: number }[];
};

const num = (v: unknown) => Number(v);

/** All food_items (≈400 rows), cached so manual logging works offline. */
export function useFoodItems() {
  return useQuery({
    queryKey: ['food_items'],
    staleTime: 24 * 3600_000,
    gcTime: 7 * 24 * 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select(
          'id, slug, name, aliases, kind, units, density_g_per_ml, kcal_100g, protein_100g, carbs_100g, fat_100g, default_oil_g',
        );
      if (error) throw error;
      return (data as FoodRow[]).map((f) => ({
        ...f,
        density_g_per_ml: f.density_g_per_ml === null ? null : num(f.density_g_per_ml),
        kcal_100g: num(f.kcal_100g),
        protein_100g: num(f.protein_100g),
        carbs_100g: num(f.carbs_100g),
        fat_100g: num(f.fat_100g),
        default_oil_g: num(f.default_oil_g),
      }));
    },
  });
}

export const mealsKey = (uid: string | undefined, day: string) => ['meals', uid, day] as const;

/** Meals for one IST day, newest last. */
export function useDayMeals(day: string) {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: mealsKey(uid, day),
    enabled: !!uid,
    queryFn: async () => {
      const { from, to } = istDayRange(day);
      const { data, error } = await supabase
        .from('meals')
        .select(
          'id, eaten_at, meal_type, source, input_mode, photo_path, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, meal_items(id, dish, unit, qty, kcal, protein_g)',
        )
        .gte('eaten_at', from)
        .lt('eaten_at', to)
        .order('eaten_at');
      if (error) throw error;
      return (data as MealRow[]).map((m) => ({
        ...m,
        kcal: num(m.kcal),
        kcal_low: num(m.kcal_low),
        kcal_high: num(m.kcal_high),
        protein_g: num(m.protein_g),
        carbs_g: num(m.carbs_g),
        fat_g: num(m.fat_g),
        meal_items: m.meal_items.map((i) => ({
          ...i,
          qty: num(i.qty),
          kcal: num(i.kcal),
          protein_g: num(i.protein_g),
        })),
      }));
    },
  });
}

export type ConfirmInput =
  | { client_id: string; draft_id: string; answers: Answer[]; eaten_at?: string }
  | {
      client_id: string;
      meal_type: MealType;
      source: MealSource;
      items: { food_item_id: string; unit: Unit; qty: number; oil_level?: OilLevel | null }[];
      eaten_at?: string;
    };

/** Save a meal through confirm-meal (the server computes every number). */
export function useConfirmMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmInput) => callFunction<ConfirmResponse>('confirm-meal', input),
    onSuccess: (res, input) => {
      track('meal_saved', { input_mode: 'draft_id' in input ? 'scan' : 'manual', kcal: res.kcal });
      qc.invalidateQueries({ queryKey: ['meals'] });
      qc.invalidateQueries({ queryKey: ['usual'] });
    },
  });
}

export type UsualDish = {
  food_item_id: string;
  unit: Unit;
  qty: number;
  oil_level: OilLevel | null;
  times_used: number;
  name: string;
};

/** The user's most-logged dishes with their usual portion ("my usual"). */
export function useUsualDishes(limit = 8) {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['usual', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_dish_defaults')
        .select('food_item_id, unit, qty, oil_level, times_used, food_items(name)')
        .order('times_used', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const f = r.food_items as unknown as { name: string } | { name: string }[] | null;
        return {
          food_item_id: r.food_item_id as string,
          unit: r.unit as Unit,
          qty: num(r.qty),
          oil_level: r.oil_level as OilLevel | null,
          times_used: r.times_used as number,
          name: (Array.isArray(f) ? f[0]?.name : f?.name) ?? '',
        };
      });
    },
  });
}

/** Owner delete (RLS allows it); used by Undo and swipe-to-delete. */
export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mealId: string) => {
      const { error } = await supabase.from('meals').delete().eq('id', mealId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['meals'] }),
  });
}

/** Per-day totals for the last `n` IST days (for Progress and streaks). */
export function useDayTotals(today: string, n = 7) {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['meals', uid, 'totals', today, n],
    enabled: !!uid,
    queryFn: async () => {
      const { from } = istDayRange(addDays(today, -(n - 1)));
      const { to } = istDayRange(today);
      const { data, error } = await supabase
        .from('meals')
        .select('eaten_at, kcal, protein_g')
        .gte('eaten_at', from)
        .lt('eaten_at', to);
      if (error) throw error;
      return groupByDay(data ?? []);
    },
  });
}

export type CoachLine = { text: string; persona: PersonaId; gentle: boolean; created_at: string };

/** Latest coach line saved today (after a meal or by the evening digest). */
export function useTodayCoach(today: string) {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['meals', uid, 'coach', today],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_messages')
        .select('text, persona, facts, created_at')
        .eq('day', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        text: data.text as string,
        persona: data.persona as PersonaId,
        gentle: (data.facts as { tone?: string } | null)?.tone === 'gentle',
        created_at: data.created_at as string,
      } satisfies CoachLine;
    },
  });
}
