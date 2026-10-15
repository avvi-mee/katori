import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { profileKey, type Profile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { groupByDay } from '@/features/personas/facts';
import { personaMeta, type PersonaId } from '@/features/personas/personas';
import { totals, type Food } from '@/features/portions/engine';
import { useScan } from '@/features/scan/store';
import { track } from '@/lib/analytics';
import { callFunction, errorCode } from '@/lib/api';
import { addDays, istDay, istDayRange } from '@/lib/day';
import { enqueue, removeFromOutbox, useOutbox, type OutboxItem, type PendingMeal } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import type { ConfirmResponse } from '@/types/api';
import type { MealSource, MealType, OilLevel, Unit } from '@/types/meal';

import { buildPending, type ConfirmBody } from './pending';

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
  /** Saved offline, waiting in the outbox. */
  pending?: boolean;
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

const pendingToRow = (p: PendingMeal): MealRow => ({
  id: p.client_id,
  eaten_at: p.eaten_at,
  meal_type: p.meal_type,
  source: p.source,
  input_mode: 'pending',
  photo_path: null,
  ...p.totals,
  meal_items: p.items.map((i) => ({
    id: i.key,
    dish: i.dish,
    unit: i.unit,
    qty: i.qty,
    kcal: i.kcal,
    protein_g: i.protein_g,
  })),
  pending: true,
});

/** Server meals for the day plus offline saves still in the outbox, minus offline deletes. */
export function mergeOutbox(rows: MealRow[], outbox: OutboxItem[], day: string): MealRow[] {
  const deleted = new Set(outbox.flatMap((o) => (o.op.kind === 'delete-meal' ? [o.op.mealId] : [])));
  const known = new Set(rows.map((r) => r.id));
  const pending = outbox.flatMap((o) =>
    o.op.kind === 'confirm-meal' &&
    o.op.pending &&
    istDay(new Date(o.op.pending.eaten_at)) === day &&
    !known.has(o.op.pending.client_id)
      ? [pendingToRow(o.op.pending)]
      : [],
  );
  return [...rows.filter((r) => !deleted.has(r.id)), ...pending].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
}

/** Meals for one IST day, oldest first, including meals saved offline. */
export function useDayMeals(day: string) {
  const uid = useSession((s) => s.session?.user.id);
  const outbox = useOutbox((s) => s.items);
  const query = useQuery({
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
  const data = useMemo(
    () => (query.data || outbox.length ? mergeOutbox(query.data ?? [], outbox, day) : undefined),
    [query.data, outbox, day],
  );
  return { ...query, data, isPending: query.isPending && !data };
}

export type ConfirmInput = ConfirmBody;

export type SaveResult = ConfirmResponse & { queued?: boolean };

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Queue a save for later and answer with a local preview, so the UI never loses the meal. */
async function queueSave(qc: QueryClient, uid: string | undefined, input: ConfirmInput): Promise<SaveResult> {
  const profile = qc.getQueryData<Profile>(profileKey(uid));
  const scan = useScan.getState();
  const pending = buildPending(input, {
    foods: qc.getQueryData<FoodRow[]>(['food_items']) ?? [],
    ctx: { katori_ml: profile?.katori_ml ?? 150, plate_size: profile?.plate_size ?? 'medium' },
    draft: scan.draft,
    draftMealType: scan.mealType,
  });
  await enqueue({ kind: 'confirm-meal', body: input, pending });
  const t = pending?.totals ?? { kcal: 0, kcal_low: 0, kcal_high: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const day = istDay(new Date(pending?.eaten_at ?? Date.now()));
  const sameDay = qc.getQueryData<MealRow[]>(mealsKey(uid, day)) ?? [];
  return {
    meal_id: input.client_id,
    items: pending?.items ?? [],
    ...t,
    source: pending?.source ?? 'home',
    day_totals: { ...totals([...sameDay, t]), meals: sameDay.length + 1 },
    coach_message: null,
    queued: true,
  };
}

/**
 * Save a meal through confirm-meal (the server computes every number). Offline or on a network error the
 * save goes to the outbox and syncs later; client_id makes the replay idempotent.
 */
export function useConfirmMeal() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async (input: ConfirmInput): Promise<SaveResult> => {
      if (isOffline()) return queueSave(qc, uid, input);
      try {
        return await callFunction<ConfirmResponse>('confirm-meal', input);
      } catch (e) {
        if (errorCode(e) === 'NETWORK') return queueSave(qc, uid, input);
        throw e;
      }
    },
    onSuccess: (res, input) => {
      if (!res.queued) track('meal_saved', { input_mode: 'draft_id' in input ? 'scan' : 'manual', kcal: res.kcal });
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

/**
 * Owner delete (RLS allows it); used by Undo and swipe-to-delete. A meal still in the outbox is simply
 * dropped from it; offline deletes are queued.
 */
export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mealId: string) => {
      const queued = useOutbox
        .getState()
        .items.find((o) => o.op.kind === 'confirm-meal' && o.op.pending?.client_id === mealId);
      if (queued) return removeFromOutbox(queued.id);
      if (isOffline()) return void (await enqueue({ kind: 'delete-meal', mealId }));
      const { error } = await supabase.from('meals').delete().eq('id', mealId);
      // supabase-js reports a dropped connection as a fetch error; keep the delete for later.
      if (error && /fetch|network/i.test(error.message)) return void (await enqueue({ kind: 'delete-meal', mealId }));
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
      if (!data?.text || !personaMeta[data.persona as PersonaId]) return null;
      return {
        text: data.text as string,
        persona: data.persona as PersonaId,
        gentle: (data.facts as { tone?: string } | null)?.tone === 'gentle',
        created_at: data.created_at as string,
      } satisfies CoachLine;
    },
  });
}
