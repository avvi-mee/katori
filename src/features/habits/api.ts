import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/features/auth/session';
import { istDay } from '@/lib/day';
import { deleteRows, num, upsertRows, useTable, type Row } from '@/lib/localRows';

import { habitAdherence, perDay, type HabitKind } from './math';

export type Trigger = 'stress' | 'chai' | 'after_food' | 'friends' | 'boredom' | 'alcohol' | 'other';
export const TRIGGERS: Trigger[] = ['stress', 'chai', 'after_food', 'friends', 'boredom', 'alcohol', 'other'];

export type Habit = {
  id: string;
  user_id: string;
  kind: HabitKind;
  name: string;
  unit: string;
  daily_target: number | null;
  baseline_per_day: number | null;
  price_per_unit: number | null;
  active: boolean;
  created_at: string;
};
export type HabitLogRow = {
  id: string;
  habit_id: string;
  logged_at: string;
  value: number;
  trigger: Trigger | null;
  note: string | null;
  pending?: boolean;
};

/** Sensible starting points; everything is editable. `step` is what one tap on the chip adds. */
export const HABIT_PRESETS: Record<HabitKind, { unit: string; daily_target: number | null; step: number }> = {
  smoking: { unit: 'cigarettes', daily_target: 0, step: 1 },
  water: { unit: 'ml', daily_target: 2500, step: 250 },
  sleep: { unit: 'h', daily_target: 7.5, step: 0.5 },
  alcohol: { unit: 'drinks', daily_target: 0, step: 1 },
  junk: { unit: 'times', daily_target: 0, step: 1 },
  sugar: { unit: 'times', daily_target: 0, step: 1 },
  custom: { unit: 'count', daily_target: 1, step: 1 },
};

const DAY = 24 * 3600_000;

export function useHabits() {
  const q = useTable<Habit>(
    'habits',
    (b) => b.select('*').order('created_at'),
    (r: Row) =>
      ({
        ...r,
        daily_target: num(r.daily_target),
        baseline_per_day: num(r.baseline_per_day),
        price_per_unit: num(r.price_per_unit),
      }) as Habit,
  );
  const active = useMemo(() => q.data?.filter((h) => h.active), [q.data]);
  return { ...q, data: active };
}

/** The last 365 days of habit logs (for streaks, smoke-free days and money saved). */
export function useHabitLogs() {
  return useTable<HabitLogRow>(
    'habit_logs',
    (b) =>
      b
        .select('*')
        .gte('logged_at', new Date(Date.now() - 365 * DAY).toISOString())
        .order('logged_at'),
    (r: Row) => ({ ...r, value: Number(r.value) }) as HabitLogRow,
  );
}

export function useHabitActions() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return {
    create: async (h: Partial<Habit> & { kind: HabitKind; name: string }) => {
      const preset = HABIT_PRESETS[h.kind];
      const row = {
        id: crypto.randomUUID(),
        user_id: uid!,
        unit: preset.unit,
        daily_target: preset.daily_target,
        baseline_per_day: null,
        price_per_unit: null,
        active: true,
        created_at: new Date().toISOString(),
        ...h,
      };
      await upsertRows(qc, 'habits', [row]);
      return row as Habit;
    },
    update: (h: Habit, patch: Partial<Habit>) => upsertRows(qc, 'habits', [{ ...h, ...patch }]),
    archive: (h: Habit) => upsertRows(qc, 'habits', [{ ...h, active: false }]),
    log: async (habitId: string, value: number, extra: { trigger?: Trigger | null; note?: string; at?: Date } = {}) => {
      const row = {
        id: crypto.randomUUID(),
        habit_id: habitId,
        logged_at: (extra.at ?? new Date()).toISOString(),
        value,
        trigger: extra.trigger ?? null,
        note: extra.note ?? null,
      };
      await upsertRows(qc, 'habit_logs', [row]);
      return row;
    },
    removeLog: (id: string) => deleteRows(qc, 'habit_logs', { id }),
  };
}

/** Today's value per habit and its 0..1 adherence (for chips and the daily score). */
export function useHabitsToday(day = istDay()) {
  const { data: habits } = useHabits();
  const { data: logs } = useHabitLogs();
  return useMemo(() => {
    if (!habits) return undefined;
    return habits.map((h) => {
      const value = perDay((logs ?? []).filter((l) => l.habit_id === h.id)).get(day) ?? 0;
      return { habit: h, value, adherence: habitAdherence(h.kind, value, h.daily_target) };
    });
  }, [habits, logs, day]);
}

/** India's National Tobacco Quitline (toll-free). */
export const QUITLINE = { label: '1800-11-2356', tel: 'tel:1800112356' };
