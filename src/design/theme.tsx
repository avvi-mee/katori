import { vars } from 'nativewind';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { idbStorage } from '@/lib/storage';

import { cssVars, palette, type Palette, type Scheme } from './tokens';

type Preference = 'system' | Scheme;

export const useThemePref = create<{ pref: Preference; setPref: (p: Preference) => void }>()(
  persist((setState) => ({ pref: 'system', setPref: (pref) => setState({ pref }) }), {
    name: 'katori-theme',
    storage: createJSONStorage(() => idbStorage),
  }),
);

type Theme = { scheme: Scheme; colors: Palette };
const ThemeContext = createContext<Theme>({ scheme: 'light', colors: palette.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = useThemePref((s) => s.pref);
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ scheme, colors: palette[scheme] }), [scheme]);
  const style = useMemo(() => vars(cssVars(value.colors)), [value]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[style, { flex: 1, backgroundColor: value.colors.bg }]}>{children}</View>
    </ThemeContext.Provider>
  );
}

/** Current scheme + raw colors, for SVG strokes and Reanimated (classNames cover the rest). */
export const useTheme = () => useContext(ThemeContext);

/** Re-applies the color variables inside portals (Modal renders outside the root view on web). */
export function ThemeVars({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const style = useMemo(() => vars(cssVars(colors)), [colors]);
  return <View style={[style, { flex: 1 }]}>{children}</View>;
}
