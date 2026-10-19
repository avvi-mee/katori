import { describe, expect, it } from 'vitest';

import {
  bestE1rm,
  detectPrs,
  deloadHint,
  e1rm,
  formatDuration,
  formatPace,
  lastTimeSummary,
  musclesHit,
  paceSecPerKm,
  progressionHint,
  runKcal,
  volume,
  workoutKcal,
  type LoggedSet,
} from '@/features/workouts/math';

const w = (kg: number, reps: number, rpe?: number): LoggedSet => ({ kind: 'working', kg, reps, rpe });

describe('e1rm / volume', () => {
  it('uses Epley', () => {
    expect(e1rm(100, 1)).toBeCloseTo(103.33, 2);
    expect(e1rm(60, 8)).toBeCloseTo(76, 0);
    expect(e1rm(0, 5)).toBe(0);
    expect(e1rm(50, 0)).toBe(0);
  });

  it('ignores warm-ups and empty sets in volume and best e1RM', () => {
    const sets: LoggedSet[] = [{ kind: 'warmup', kg: 20, reps: 10 }, w(60, 8), w(60, 8), { kind: 'working', kg: null, reps: 8 }];
    expect(volume(sets)).toBe(960);
    expect(bestE1rm(sets)).toBeCloseTo(76, 0);
    expect(bestE1rm([])).toBe(0);
  });
});

describe('progressionHint', () => {
  it('adds 2.5 kg for upper body when every working set hits the top of the range', () => {
    expect(progressionHint([w(60, 10), w(60, 10, 8)], 10, ['chest'])).toEqual({ addKg: 2.5, nextKg: 62.5 });
  });

  it('adds 5 kg for lower body', () => {
    expect(progressionHint([w(100, 8), w(100, 8)], 8, ['quadriceps'])).toEqual({ addKg: 5, nextKg: 105 });
  });

  it('holds when a set missed the range or was too hard', () => {
    expect(progressionHint([w(60, 10), w(60, 9)], 10, ['chest'])).toBeNull();
    expect(progressionHint([w(60, 10), w(60, 10, 9)], 10, ['chest'])).toBeNull();
    expect(progressionHint([{ kind: 'warmup', kg: 20, reps: 12 }], 10, ['chest'])).toBeNull();
  });

  it('ignores warm-ups when judging', () => {
    expect(progressionHint([{ kind: 'warmup', kg: 20, reps: 5 }, w(60, 10)], 10, ['chest'])?.nextKg).toBe(62.5);
  });
});

describe('deloadHint', () => {
  it('fires after three drops in a row', () => {
    expect(deloadHint([80, 78, 76, 74])).toBe(true);
    expect(deloadHint([70, 80, 78, 76, 74])).toBe(true);
  });
  it('needs four sessions and a strict streak', () => {
    expect(deloadHint([80, 78, 76])).toBe(false);
    expect(deloadHint([80, 78, 79, 74])).toBe(false);
    expect(deloadHint([80, 80, 78, 76])).toBe(false);
  });
});

describe('summaries', () => {
  it('formats last time', () => {
    expect(lastTimeSummary([w(60, 8), w(60, 8), w(60, 7)])).toBe('60 kg × 8, 8, 7');
    expect(lastTimeSummary([w(60, 8), w(62.5, 6)])).toBe('60×8, 62.5×6');
    expect(lastTimeSummary([{ kind: 'warmup', kg: 20, reps: 10 }])).toBeNull();
  });

  it('lists muscles with at least one counted set', () => {
    expect(
      musclesHit([
        { primary_muscles: ['chest'], sets: [w(60, 8)] },
        { primary_muscles: ['chest', 'triceps'], sets: [w(20, 10)] },
        { primary_muscles: ['biceps'], sets: [{ kind: 'warmup', kg: 10, reps: 10 }] },
      ]),
    ).toEqual(['chest', 'triceps']);
  });
});

describe('burn and pace', () => {
  it('estimates a strength session as a range', () => {
    expect(workoutKcal(3600, 70)).toEqual({ low: 245, high: 420 });
    expect(workoutKcal(-5, 70)).toEqual({ low: 0, high: 0 });
  });

  it('estimates runs, walks and rides', () => {
    expect(runKcal('run', 5000, 70)).toEqual({ low: 315, high: 385 });
    expect(runKcal('walk', 1000, 60)).toEqual({ low: 30, high: 42 });
    expect(runKcal('cycle', 10000, 80)).toEqual({ low: 200, high: 280 });
  });

  it('formats pace and duration', () => {
    expect(formatPace(paceSecPerKm(5000, 1500))).toBe('5:00 /km');
    expect(paceSecPerKm(0, 100)).toBe(0);
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('detectPrs (mirrors the database trigger)', () => {
  const h = (workout_id: string, kg: number, reps: number, kind: LoggedSet['kind'] = 'working') => ({
    exercise_id: 'bench',
    workout_id,
    kind,
    kg,
    reps,
  });

  it('treats the first sets of an exercise as the baseline', () => {
    expect(detectPrs([], [h('w1', 20, 12, 'warmup'), h('w1', 60, 8), h('w1', 60, 8)])).toEqual([]);
  });

  it('finds weight, reps, e1RM and volume PRs, best per kind', () => {
    const history = [h('w1', 60, 8), h('w1', 60, 8)];
    const prs = detectPrs(history, [h('w2', 65, 6), h('w2', 60, 10), h('w2', 50, 10)]);
    const by = Object.fromEntries(prs.map((p) => [p.kind, p]));
    expect(by.weight).toMatchObject({ value: 65, reps: 6 });
    expect(by.reps).toMatchObject({ value: 10, kg: 60 });
    expect(by.e1rm!.value).toBeCloseTo(80, 2);
    expect(by.volume!.value).toBe(1490);
  });

  it('ignores warm-ups', () => {
    expect(detectPrs([h('w1', 60, 8)], [h('w2', 200, 1, 'warmup')])).toEqual([]);
  });
});
