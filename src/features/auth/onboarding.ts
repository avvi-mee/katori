import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Activity, Goal, Sex } from '@/features/goals/targets';
import type { PersonaId } from '@/features/personas/personas';
import type { Locale } from '@/lib/i18n';
import { idbStorage } from '@/lib/storage';

export type Answers = {
  goal?: Goal;
  sex?: Sex;
  birth_year?: number;
  height_cm?: number;
  weight_kg?: number;
  activity?: Activity;
  diet_type?: 'veg' | 'egg' | 'nonveg' | 'jain';
  katori_ml: number;
  plate_size: 'small' | 'medium' | 'large';
  persona: PersonaId;
  savage_mode: boolean;
  adult_confirmed: boolean;
  locale: Locale;
};

export const ONBOARDING_STEPS = [
  'index',
  'goal',
  'body',
  'diet',
  'katori-calibration',
  'coach-picker',
  'plan-reveal',
  'paywall',
] as const;

const initial: Answers = {
  katori_ml: 150,
  plate_size: 'medium',
  persona: 'hype_friend',
  savage_mode: false,
  adult_confirmed: false,
  locale: 'en',
};

/** Onboarding answers survive a refresh mid-flow (IndexedDB). */
export const useOnboarding = create<Answers & { set: (patch: Partial<Answers>) => void; reset: () => void }>()(
  persist((set) => ({ ...initial, set: (patch) => set(patch), reset: () => set(initial) }), {
    name: 'katori-onboarding',
    storage: createJSONStorage(() => idbStorage),
  }),
);
