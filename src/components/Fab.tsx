import { router } from 'expo-router';
import { Camera, List, Plus, Type } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { PressableScale } from './PressableScale';
import { Sheet } from './Sheet';
import { Text } from './Text';

/** Floating + : Scan meal, Type a meal, Add from list. (Workout, run and habit join in Phase 1B.) */
export function Fab() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const go = (href: Parameters<typeof router.push>[0]) => {
    setOpen(false);
    router.push(href);
  };
  const actions = [
    { label: t('fab.scan'), Icon: Camera, href: '/scan/camera' as const },
    { label: t('fab.type'), Icon: Type, href: '/(tabs)/food?type=1' as const },
    { label: t('fab.add'), Icon: List, href: '/(tabs)/food?add=1' as const },
  ];

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        accessibilityLabel={t('fab.open')}
        pressedScale={0.9}
        className="absolute bottom-[84px] right-4 h-16 w-16 items-center justify-center rounded-full bg-accent"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Plus color={colors.onAccent} size={30} strokeWidth={2.5} />
      </PressableScale>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('fab.title')}>
        <View className="gap-2">
          {actions.map(({ label, Icon, href }) => (
            <PressableScale
              key={label}
              onPress={() => go(href)}
              accessibilityLabel={label}
              pressedScale={0.98}
              className="min-h-[60px] flex-row items-center gap-4 rounded-card border border-line bg-surface px-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                <Icon color={colors.ink} size={22} />
              </View>
              <Text variant="heading">{label}</Text>
            </PressableScale>
          ))}
        </View>
      </Sheet>
    </>
  );
}
