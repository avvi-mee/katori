import { create } from 'zustand';

import { mealTypeFor } from '@/features/meals/format';
import type { ConfirmResponse, DraftResponse } from '@/types/api';
import type { MealType } from '@/types/meal';

type ScanState = {
  photo: { blob: Blob; url: string } | null;
  mealType: MealType;
  hint: string;
  startedAt: number;
  /** When the photo was taken (offline scans are analysed later but logged at this time). */
  takenAt: string | null;
  /** Set when analysing a photo saved offline, so it can be removed once analysed. */
  pendingScanId: string | null;
  draft: DraftResponse | null;
  result: ConfirmResponse | null;
  set: (patch: Partial<Omit<ScanState, 'set' | 'reset'>>) => void;
  reset: () => void;
};

/** One scan at a time: photo → draft → result. */
export const useScan = create<ScanState>((set, get) => ({
  photo: null,
  mealType: mealTypeFor(),
  hint: '',
  startedAt: 0,
  takenAt: null,
  pendingScanId: null,
  draft: null,
  result: null,
  set: (patch) => set(patch),
  reset: () => {
    const url = get().photo?.url;
    if (url) URL.revokeObjectURL(url);
    set({
      photo: null,
      mealType: mealTypeFor(),
      hint: '',
      startedAt: 0,
      takenAt: null,
      pendingScanId: null,
      draft: null,
      result: null,
    });
  },
}));
