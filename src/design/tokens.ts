// Design tokens from docs/ARCHITECTURE.md "Design tokens". surface2, line, accentSoft and
// onAccent are derived helpers (borders, chip fills, text on Saffron); everything else is the doc.
export type Scheme = 'light' | 'dark';

export const palette = {
  light: {
    bg: '#FAF7F2',
    surface: '#FFFFFF',
    surface2: '#F3EEE6',
    line: '#E8E1D6',
    ink: '#1A1714',
    inkMuted: '#6B645C',
    accent: '#F26B1D',
    accentSoft: '#FDE6D6',
    onAccent: '#1A1714',
    protein: '#2F9E6B',
    carbs: '#E8B12E',
    fat: '#D9483B',
  },
  dark: {
    bg: '#12100E',
    surface: '#1C1916',
    surface2: '#262220',
    line: '#332E29',
    ink: '#F4EFE8',
    inkMuted: '#A39A90',
    accent: '#FF8A3D',
    accentSoft: '#3A2416',
    onAccent: '#1A1714',
    protein: '#4CC48A',
    carbs: '#F2C14E',
    fat: '#F06A5C',
  },
} as const;

export type Palette = { [K in keyof (typeof palette)['light']]: string };

export const radius = { input: 12, card: 20, sheet: 28 } as const;
export const space = [0, 4, 8, 12, 16, 24, 32] as const;
export const touch = 44;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  sans: 'Manrope_500Medium',
  sansRegular: 'Manrope_400Regular',
  sansSemibold: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
} as const;

/** CSS variables consumed by tailwind.config.js colors. */
export function cssVars(p: Palette): Record<string, string> {
  return {
    '--color-bg': p.bg,
    '--color-surface': p.surface,
    '--color-surface-2': p.surface2,
    '--color-line': p.line,
    '--color-ink': p.ink,
    '--color-ink-muted': p.inkMuted,
    '--color-accent': p.accent,
    '--color-accent-soft': p.accentSoft,
    '--color-on-accent': p.onAccent,
    '--color-protein': p.protein,
    '--color-carbs': p.carbs,
    '--color-fat': p.fat,
  };
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
