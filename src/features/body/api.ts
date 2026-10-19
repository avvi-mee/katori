import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { compressPhoto } from '@/features/scan/photo';
import { istDay } from '@/lib/day';
import { isDemo } from '@/lib/demo';
import { num, upsertRows, useTable, type Row } from '@/lib/localRows';
import { supabase } from '@/lib/supabase';

export type Weight = { user_id: string; date: string; weight_kg: number; pending?: boolean };
export type BodyLog = {
  id: string;
  user_id: string;
  date: string;
  waist_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  photo_path: string | null;
};
export const MEASUREMENTS = ['waist_cm', 'chest_cm', 'arm_cm', 'thigh_cm'] as const;
export type Measurement = (typeof MEASUREMENTS)[number];

/** Weigh-ins, oldest first (weight lives in `weights`; body_logs holds measurements and photos). */
export function useWeights() {
  return useTable<Weight>(
    'weights',
    (b) => b.select('*').order('date'),
    (r: Row) => ({ ...r, weight_kg: Number(r.weight_kg) }) as Weight,
  );
}

export function useBodyLogs() {
  return useTable<BodyLog>(
    'body_logs',
    (b) => b.select('id, user_id, date, waist_cm, chest_cm, arm_cm, thigh_cm, photo_path').order('date'),
    (r: Row) =>
      ({
        ...r,
        waist_cm: num(r.waist_cm),
        chest_cm: num(r.chest_cm),
        arm_cm: num(r.arm_cm),
        thigh_cm: num(r.thigh_cm),
      }) as BodyLog,
  );
}

export function useBodyActions() {
  const qc = useQueryClient();
  const uid = useSession((s) => s.session?.user.id);
  return {
    logWeight: (kg: number, date = istDay()) =>
      upsertRows(qc, 'weights', [{ user_id: uid!, date, weight_kg: Math.round(kg * 10) / 10 }]),
    /** One body log per day: an existing row for the date is updated in place. */
    saveBodyLog: (existing: BodyLog | undefined, patch: Partial<BodyLog>, date = istDay()) =>
      upsertRows(qc, 'body_logs', [{ ...(existing ?? { id: crypto.randomUUID(), user_id: uid!, date }), ...patch }]),
    /** Progress photos need the network (the upload is the write); compressed and EXIF-stripped first. */
    uploadPhoto: async (file: Blob) => {
      const jpeg = await compressPhoto(file);
      const path = `${uid}/${istDay()}-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from('body-photos').upload(path, jpeg, { contentType: 'image/jpeg' });
      if (error) throw error;
      return path;
    },
  };
}

/** Short-lived signed URL for a private progress photo. */
export function usePhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ['body-photo', path],
    enabled: !!path && !isDemo,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('body-photos').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
