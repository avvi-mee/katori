import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import type { Food } from '@/features/portions/engine';
import { track } from '@/lib/analytics';
import { callFunction } from '@/lib/api';
import { istDayRange } from '@/lib/day';
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
    },
  });
}
