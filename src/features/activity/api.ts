import { useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { deleteRows, num, upsertRows, useTable, type Row } from '@/lib/localRows';

export type ActivityDay = { user_id: string; date: string; steps: number; source: string; active_kcal: number | null };
export type Run = {
  id: string;
  user_id: string;
  kind: 'run' | 'walk' | 'cycle';
  started_at: string;
  distance_m: number;
  duration_s: number;
  notes: string | null;
  pending?: boolean;
};

const since = (days: number) => new Date(Date.now() - days * 24 * 3600_000).toISOString().slice(0, 10);

export function useActivityDays() {
  return useTable<ActivityDay>('activity_days', (b) => b.select('*').gte('date', since(365)).order('date'));
}

export function useRuns() {
  return useTable<Run>(
    'runs',
    (b) =>
      b
        .select('id, user_id, kind, started_at, distance_m, duration_s, notes')
        .gte('started_at', since(365))
        .order('started_at', { ascending: false }),
    (r: Row) => ({ ...r, distance_m: Number(r.distance_m), duration_s: Number(r.duration_s) }) as Run,
  );
}

export function useActivityActions() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return {
    setSteps: (date: string, steps: number) =>
      upsertRows(qc, 'activity_days', [
        {
          user_id: uid!,
          date,
          steps: Math.max(0, Math.min(200_000, Math.round(steps))),
          source: 'manual',
          updated_at: new Date().toISOString(),
        },
      ]),
    logRun: async (
      r: Pick<Run, 'kind' | 'distance_m' | 'duration_s'> & { started_at?: string; notes?: string | null },
    ) => {
      const row = { id: crypto.randomUUID(), user_id: uid!, started_at: new Date().toISOString(), notes: null, ...r };
      await upsertRows(qc, 'runs', [row]);
      return row as Run;
    },
    removeRun: (id: string) => deleteRows(qc, 'runs', { id }),
  };
}

export const stepsOn = (days: ActivityDay[] | undefined, date: string) =>
  num(days?.find((d) => d.date === date)?.steps);
