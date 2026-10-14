import { describe, expect, it } from 'vitest';

import { contrast, palette } from '@/design/tokens';

describe('design tokens', () => {
  it('computes WCAG contrast correctly', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  for (const scheme of ['light', 'dark'] as const) {
    const p = palette[scheme];
    // Every text/background pair the UI uses must meet 4.5:1.
    const pairs: [string, string, string][] = [
      ['ink on bg', p.ink, p.bg],
      ['ink on surface', p.ink, p.surface],
      ['ink on surface2', p.ink, p.surface2],
      ['inkMuted on bg', p.inkMuted, p.bg],
      ['inkMuted on surface', p.inkMuted, p.surface],
      ['onAccent on accent (primary button)', p.onAccent, p.accent],
      ['ink on accentSoft (range badge)', p.ink, p.accentSoft],
      ['bg on ink (toast)', p.bg, p.ink],
    ];
    for (const [name, fg, bg] of pairs) {
      it(`${scheme}: ${name} ≥ 4.5:1`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('white on Saffron fails, which is why buttons use onAccent', () => {
    expect(contrast('#FFFFFF', palette.light.accent)).toBeLessThan(4.5);
  });
});

describe('textClass', () => {
  it('lets a caller color/font replace the variant default', async () => {
    const { textClass } = await import('@/design/typography');
    expect(textClass('label')).toContain('text-ink');
    expect(textClass('label', 'text-bg')).not.toMatch(/text-ink(\s|$)/);
    expect(textClass('caption', 'font-sans-bold')).not.toMatch(/(^|\s)font-sans(\s|$)/);
    expect(textClass('caption', 'mt-2')).toContain('text-ink-muted');
  });
});
