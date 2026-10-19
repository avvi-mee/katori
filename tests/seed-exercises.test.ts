import { describe, expect, it } from 'vitest';

import { loadExercises } from '../scripts/build-exercise-seed.mjs';

const { rows, extras } = loadExercises() as {
  rows: {
    slug: string;
    name: string;
    aliases: string[];
    category: string;
    images: string[];
    primary_muscles: string[];
  }[];
  extras: { templates: { name: string; split: string; exercises: [string, number, number, number, number][] }[] };
};

describe('exercise library seed', () => {
  it('has the free-exercise-db library (873+ exercises) with unique slugs', () => {
    expect(rows.length).toBeGreaterThanOrEqual(873);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });

  it('uses our category vocabulary and keeps images + muscles', () => {
    const allowed = [
      'strength',
      'stretching',
      'plyometrics',
      'strongman',
      'powerlifting',
      'cardio',
      'olympic_weightlifting',
    ];
    for (const r of rows) expect(allowed).toContain(r.category);
    expect(rows.filter((r) => r.images.length).length / rows.length).toBeGreaterThan(0.95);
    expect(rows.filter((r) => r.primary_muscles.length).length / rows.length).toBeGreaterThan(0.95);
  });

  it('has Indian gym aliases and cardio machines', () => {
    const byAlias = (a: string) => rows.find((r) => r.aliases.includes(a))?.name;
    expect(byAlias('chest press machine')).toBe('Leverage Chest Press');
    expect(byAlias('lat pull')).toBe('Wide-Grip Lat Pulldown');
    expect(byAlias('cross trainer')).toBe('Elliptical Trainer');
    expect(byAlias('treadmill')).toBeTruthy();
  });

  it('seeds PPL, Upper/Lower, Bro split and Full body templates with sane rep ranges', () => {
    expect(new Set(extras.templates.map((t) => t.split))).toEqual(new Set(['ppl', 'upper_lower', 'bro', 'full_body']));
    const slugs = new Set(rows.map((r) => r.slug));
    for (const t of extras.templates) {
      expect(t.exercises.length).toBeGreaterThanOrEqual(4);
      for (const [slug, sets, min, max, rest] of t.exercises) {
        expect(slugs.has(slug), `${t.name}: ${slug}`).toBe(true);
        expect(sets).toBeGreaterThan(0);
        expect(min).toBeLessThanOrEqual(max);
        expect(rest).toBeGreaterThanOrEqual(30);
      }
    }
  });
});
