import { create } from 'zustand';

export type PlanItem = { exercise_id: string; sets: number; rep_min: number; rep_max: number; rest_s: number };

/** The plan being built on /coach/plans (the exercise picker adds to it in mode=plan). */
export const usePlanDraft = create<{
  name: string;
  items: PlanItem[];
  set: (patch: Partial<{ name: string; items: PlanItem[] }>) => void;
  add: (ids: string[]) => void;
  reset: () => void;
}>((set) => ({
  name: '',
  items: [],
  set: (patch) => set(patch),
  add: (ids) =>
    set((s) => ({
      items: [...s.items, ...ids.map((exercise_id) => ({ exercise_id, sets: 3, rep_min: 8, rep_max: 12, rest_s: 90 }))],
    })),
  reset: () => set({ name: '', items: [] }),
}));
