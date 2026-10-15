import { describe, expect, it } from 'vitest';

import { parsePreferences } from '@/types/preferences';

describe('parsePreferences', () => {
  it('fills every default from an empty or missing value', () => {
    for (const raw of [undefined, null, {}, [], 'x']) {
      const p = parsePreferences(raw);
      expect(p).toMatchObject({
        training_place: 'gym',
        training_days: 3,
        units: { weight: 'kg', distance: 'km' },
        add_burn_to_targets: false,
        default_rest_s: 90,
      });
      expect(p.modules).toContain('food');
    }
  });

  it('keeps valid fields and replaces only the broken ones', () => {
    const p = parsePreferences({
      training_place: 'home',
      equipment: ['dumbbell', 'laser-gun'],
      training_days: 12,
      units: { weight: 'lb', distance: 'parsecs' },
      reminders: { meals: ['08:30', '25:00'], workout: '18:00' },
    });
    expect(p.training_place).toBe('home');
    expect(p.equipment).toEqual([]); // one bad item invalidates the list
    expect(p.training_days).toBe(3);
    expect(p.units).toEqual({ weight: 'lb', distance: 'km' });
    expect(p.reminders.meals).toEqual([]);
    expect(p.reminders.workout).toBe('18:00');
  });
});
