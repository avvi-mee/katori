import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { finishRows, useLiveWorkout } from '@/features/workouts/session';

const s = () => useLiveWorkout.getState();
const ex = (i: number) => s().live!.exercises[i]!;

beforeEach(() => {
  s().discard();
  s().start({
    name: 'Push',
    template_id: 't1',
    plan: [
      { exercise_id: 'bench', sets: 2, rep_min: 6, rep_max: 10, rest_s: 120 },
      { exercise_id: 'fly', sets: 1 },
      { exercise_id: 'dips', sets: 1 },
    ],
  });
});

describe('live workout', () => {
  it('starts from a plan', () => {
    expect(s().live!.exercises.map((e) => [e.exercise_id, e.sets.length, e.rest_s])).toEqual([
      ['bench', 2, 120],
      ['fly', 1, 90],
      ['dips', 1, 90],
    ]);
  });

  it('ticking fills empty fields from the ghost values and starts the rest timer', () => {
    const set = ex(0).sets[0]!;
    s().updateSet(ex(0).key, set.id, { reps: 9 });
    s().toggleDone(ex(0).key, set.id, { kg: 60, reps: 8 }, 1_000);
    expect(ex(0).sets[0]).toMatchObject({ kg: 60, reps: 9 });
    expect(s().rest).toEqual({ ends_at: 121_000, total_s: 120 });
    s().toggleDone(ex(0).key, set.id);
    expect(ex(0).sets[0]!.done_at).toBeNull();
  });

  it('supersets rest only after the last exercise of the pair', () => {
    s().toggleSuperset(ex(1).key);
    expect([ex(1).superset_group, ex(2).superset_group]).toEqual([1, 1]);
    s().toggleDone(ex(1).key, ex(1).sets[0]!.id, { kg: 10, reps: 12 }, 0);
    expect(s().rest).toBeNull();
    s().toggleDone(ex(2).key, ex(2).sets[0]!.id, { kg: 0, reps: 10 }, 0);
    expect(s().rest?.total_s).toBe(90);
    s().toggleSuperset(ex(2).key);
    expect(ex(1).superset_group).toBeNull();
  });

  it('adds sets carrying the last weight, and reorders exercises', () => {
    s().updateSet(ex(0).key, ex(0).sets[1]!.id, { kg: 62.5 });
    s().addSet(ex(0).key);
    expect(ex(0).sets[2]).toMatchObject({ kg: 62.5, reps: null, kind: 'working' });
    s().moveExercise(ex(2).key, -1);
    expect(s().live!.exercises.map((e) => e.exercise_id)).toEqual(['bench', 'dips', 'fly']);
  });
});

describe('finishRows', () => {
  it('returns null when nothing was completed', () => {
    expect(finishRows(s().live!, 'u1', 70)).toBeNull();
  });

  it('keeps completed sets, numbers them per exercise and totals the session', () => {
    const start = Date.parse(s().live!.started_at);
    for (const set of ex(0).sets) s().toggleDone(ex(0).key, set.id, { kg: 60, reps: 8 }, start + 60_000);
    s().toggleDone(ex(1).key, ex(1).sets[0]!.id, undefined, start + 120_000); // empty: dropped
    const r = finishRows(s().live!, 'u1', 70, start + 3_600_000)!;
    expect(r.sets.map((x) => [x.exercise_id, x.set_no, x.kg, x.reps])).toEqual([
      ['bench', 1, 60, 8],
      ['bench', 2, 60, 8],
    ]);
    expect(r.workout).toMatchObject({ user_id: 'u1', template_id: 't1', duration_s: 3600, volume_kg: 960, kcal_low: 245, kcal_high: 420 });
  });
});
