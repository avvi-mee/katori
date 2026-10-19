import { router } from 'expo-router';

import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';

import type { TemplateWithExercises, WorkoutWithSets } from './api';
import { useLiveWorkout } from './session';

/** Starts (or resumes, if one is running) a workout and opens the logger. */
export function startWorkout(template: TemplateWithExercises | null, defaultRest = 90) {
  const live = useLiveWorkout.getState();
  if (!live.live) {
    track('workout_started', { from_template: !!template });
    live.start({
      name: template?.name ?? t('train.emptyName'),
      template_id: template?.id ?? null,
      defaultRest,
      plan: (template?.exercises ?? []).map((e) => ({
        exercise_id: e.exercise_id,
        sets: e.sets,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        rest_s: e.rest_s,
      })),
    });
  }
  router.push('/workout/live');
}

/**
 * Today's suggested session: the next template in the split the user last trained from (Push → Pull →
 * Legs → Push …); with no history, the first library template.
 */
export function suggestTemplate(
  templates: TemplateWithExercises[] | undefined,
  workouts: WorkoutWithSets[] | undefined,
): TemplateWithExercises | null {
  if (!templates?.length) return null;
  const last = workouts?.find((w) => w.template_id && templates.some((x) => x.id === w.template_id));
  const lastT = last && templates.find((x) => x.id === last.template_id);
  if (!lastT?.split) return templates[0]!;
  const same = templates.filter((x) => x.split === lastT.split && x.owner_id === lastT.owner_id);
  const i = same.findIndex((x) => x.id === lastT.id);
  return same[(i + 1) % same.length] ?? lastT;
}
