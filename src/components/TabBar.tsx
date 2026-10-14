import type { Tabs } from 'expo-router';
import { CircleUser, Sun, TrendingUp, UtensilsCrossed } from 'lucide-react-native';
import type React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { t, type MessageKey } from '@/lib/i18n';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: MessageKey; Icon: typeof Sun }> = {
  index: { label: 'tabs.today', Icon: Sun },
  food: { label: 'tabs.food', Icon: UtensilsCrossed },
  progress: { label: 'tabs.progress', Icon: TrendingUp },
  me: { label: 'tabs.me', Icon: CircleUser },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-line bg-surface"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === i;
        const color = focused ? colors.accent : colors.inkMuted;
        return (
          <PressableScale
            key={route.key}
            accessibilityRole="tab"
            aria-selected={focused}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            pressedScale={0.92}
            className="min-h-[56px] flex-1 items-center justify-center gap-0.5 pt-2"
          >
            <tab.Icon color={color} size={24} strokeWidth={focused ? 2.4 : 2} />
            <Text variant="caption" className={focused ? 'font-sans-bold text-ink' : ''}>
              {t(tab.label)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
