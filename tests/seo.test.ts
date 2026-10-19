import { describe, expect, it } from 'vitest';

import { dishPage, esc, indexPage, loadDishes, servings, sitemap } from '../scripts/build-seo.mjs';
import { computeItem, type Food } from '@/features/portions/engine';

type Dish = Food & { slug: string; aliases: string[]; cuisine: string | null; kind: string };
const dishes = loadDishes() as Dish[];
const SITE = 'https://katori.unmatrix.in';

describe('SEO pages', () => {
  it('generates a page for every dish with a slug', () => {
    expect(dishes.length).toBeGreaterThanOrEqual(300);
    expect(new Set(dishes.map((d) => d.slug)).size).toBe(dishes.length);
    expect(dishes.every((d) => /^[a-z0-9-]+$/.test(d.slug))).toBe(true);
  });

  it('uses the app portion engine for the numbers', () => {
    const roti = dishes.find((d) => d.slug === 'roti')!;
    const s = servings(roti) as { unit: string; kcal: number; protein: number }[];
    const engine = computeItem(
      roti,
      { key: 'x', dish: 'Roti', unit: 'roti', qty: 1, oil_level: null, confidence: 1, certainty: 'asked' },
      { katori_ml: 150, plate_size: 'medium' },
      'home',
    );
    expect(s[0]).toMatchObject({ unit: 'roti', kcal: Math.round(engine.kcal) });
    expect(s.at(-1)!.unit).toBe('g');
  });

  it('renders title, canonical, CTA and related links, escaping names', () => {
    const dal = dishes.find((d) => d.slug === 'dal-tadka')!;
    const html = dishPage({ ...dal, name: 'Dal <Tadka> & "Co"' }, dishes.slice(0, 2), SITE) as string;
    expect(html).toContain('<link rel="canonical" href="https://katori.unmatrix.in/calories/dal-tadka">');
    expect(html).toContain('Dal &lt;Tadka&gt; &amp; &quot;Co&quot;');
    expect(html).not.toContain('<Tadka>');
    expect(html).toMatch(/<title>Dal &lt;Tadka&gt; &amp; &quot;Co&quot; calories: \d+ kcal in 1 katori/);
    expect(html).toContain('href="/"');
    expect(html).toContain(`/calories/${dishes[0]!.slug}`);
    expect(html).not.toContain('<script');
  });

  it('lists every dish in the index and sitemap', () => {
    expect((indexPage(dishes, SITE) as string).match(/<li>/g)).toHaveLength(dishes.length);
    const xml = sitemap(dishes, SITE, '2026-10-20') as string;
    expect(xml.match(/<url>/g)).toHaveLength(dishes.length + 3);
    expect(xml).toContain('<loc>https://katori.unmatrix.in/calories/roti</loc>');
    expect(esc(`a&b<'>`)).toBe('a&amp;b&lt;&#39;&gt;');
  });
});
