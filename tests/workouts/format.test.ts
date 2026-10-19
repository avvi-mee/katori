import { describe, expect, it } from 'vitest';

import type { Exercise } from '@/features/workouts/api';
import { searchExercises } from '@/features/workouts/format';

const ex = (name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id: name,
  slug: name,
  name,
  aliases: [],
  primary_muscles: ['chest'],
  secondary_muscles: [],
  equipment: 'barbell',
  mechanic: null,
  category: 'strength',
  images: [],
  owner_id: null,
  ...extra,
});

const list = [
  ex('Barbell Bench Press - Medium Grip'),
  ex('Incline Dumbbell Press', { equipment: 'dumbbell' }),
  ex('Leverage Chest Press', { aliases: ['chest press machine'], equipment: 'machine' }),
  ex('Wide-Grip Lat Pulldown', { aliases: ['lat pull'], primary_muscles: ['lats'], equipment: 'cable' }),
];

describe('searchExercises', () => {
  it('matches names and Indian gym aliases, prefix first', () => {
    expect(searchExercises(list, 'lat pull').map((e) => e.name)).toEqual(['Wide-Grip Lat Pulldown']);
    expect(searchExercises(list, 'chest press')[0]!.name).toBe('Leverage Chest Press');
    expect(searchExercises(list, 'press').map((e) => e.name)).toHaveLength(3);
  });
  it('filters by muscle and equipment', () => {
    expect(searchExercises(list, '', { muscle: 'lats' })).toHaveLength(1);
    expect(searchExercises(list, 'press', { equipment: 'dumbbell' }).map((e) => e.name)).toEqual([
      'Incline Dumbbell Press',
    ]);
  });
});
