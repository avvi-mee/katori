// Colors are CSS variables set at the app root from src/design/tokens.ts (light/dark),
// so one class like `bg-bg` works in both themes.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        line: 'var(--color-line)',
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        accent: 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        'on-accent': 'var(--color-on-accent)',
        protein: 'var(--color-protein)',
        carbs: 'var(--color-carbs)',
        fat: 'var(--color-fat)',
      },
      fontFamily: {
        display: ['Fraunces_600SemiBold'],
        'display-bold': ['Fraunces_700Bold'],
        sans: ['Manrope_500Medium'],
        'sans-regular': ['Manrope_400Regular'],
        'sans-semibold': ['Manrope_600SemiBold'],
        'sans-bold': ['Manrope_700Bold'],
      },
      borderRadius: { input: '12px', card: '20px', sheet: '28px' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
