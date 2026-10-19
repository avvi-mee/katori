// Exercise images are paths relative to this base (free-exercise-db layout). Defaults to the dataset on GitHub;
// point it at the Supabase bucket after running scripts/upload-exercise-images.mjs.
const BASE =
  process.env.EXPO_PUBLIC_EXERCISE_IMAGE_BASE ??
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export const exerciseImageUrl = (path: string | undefined) =>
  !path ? null : /^https?:\/\//.test(path) ? path : BASE + path;
