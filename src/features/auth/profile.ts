import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PersonaId } from '@/features/personas/personas';
import { supabase } from '@/lib/supabase';

import { useSession } from './session';

export type Profile = {
  id: string;
  role: 'user' | 'coach';
  name: string | null;
  sex: 'male' | 'female' | 'other' | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: string | null;
  activity: string | null;
  diet_type: 'veg' | 'egg' | 'nonveg' | 'jain' | null;
  kcal_target: number | null;
  protein_target: number | null;
  kcal_floor: number | null;
  katori_ml: number;
  plate_size: 'small' | 'medium' | 'large';
  persona: PersonaId;
  savage_mode: boolean;
  adult_confirmed: boolean;
  locale: 'en' | 'hinglish';
  nudges_muted: boolean;
  onboarded_at: string | null;
  /** Raw jsonb; read it with parsePreferences (src/types/preferences.ts). */
  preferences?: Record<string, unknown>;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'role'>>;

export const profileKey = (uid: string | undefined) => ['profile', uid] as const;

export function useProfile() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: profileKey(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useUpdateProfile() {
  const uid = useSession((s) => s.session?.user.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid!).select('*').single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (profile) => qc.setQueryData(profileKey(uid), profile),
  });
}
