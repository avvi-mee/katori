import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Camera, Dumbbell, Footprints, List, Plus, Scale, Timer, Type, type LucideIcon } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { PressableScale } from './PressableScale';
import { Sheet } from './Sheet';
import { Text } from './Text';

type Href = Parameters<typeof router.push>[0];

/** Floating + : Scan meal, Type a meal, Add from list, Start workout, Log run, Log habit, steps, weight. */
export function Fab() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };
  const actions: { label: string; Icon: LucideIcon; href: Href }[] = [
    { label: t('fab.scan'), Icon: Camera, href: '/scan/camera' },
    { label: t('fab.type'), Icon: Type, href: '/(tabs)/food?type=1' },
    { label: t('fab.add'), Icon: List, href: '/(tabs)/food?add=1' },
    { label: t('fab.workout'), Icon: Dumbbell, href: '/(tabs)/train' },
    { label: t('fab.run'), Icon: Timer, href: '/activity?run=1' },
    { label: t('fab.habit'), Icon: Plus, href: '/habits' },
    { label: t('fab.steps'), Icon: Footprints, href: '/activity?steps=1' },
    { label: t('fab.weight'), Icon: Scale, href: '/body' },
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
        <View className="flex-row flex-wrap gap-2">
          {actions.map(({ label, Icon, href }) => (
            <PressableScale
              key={label}
              onPress={() => go(href)}
              accessibilityLabel={label}
              pressedScale={0.98}
              className="min-h-[60px] min-w-[45%] flex-1 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                <Icon color={colors.ink} size={20} />
              </View>
              <Text variant="label" className="flex-1">
                {label}
              </Text>
            </PressableScale>
          ))}
        </View>
      </Sheet>
    </>
  );
}
