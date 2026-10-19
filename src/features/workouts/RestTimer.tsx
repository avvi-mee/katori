import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Timer } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';
import { useNow } from '@/lib/useNow';

import { formatDuration } from './math';
import { useLiveWorkout } from './session';

const vibrate = (p: number | number[]) => {
  try {
    globalThis.navigator?.vibrate?.(p);
  } catch {
    /* not supported (iOS Safari) */
  }
};

/** Docked rest countdown. Based on an end time, so it survives reloads; buzzes when rest is over. */
export function RestTimer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const rest = useLiveWorkout((s) => s.rest);
  const { skipRest, addRest } = useLiveWorkout.getState();
  const now = useNow(250);
  const buzzed = useRef<number | null>(null);
  const left = rest ? Math.max(0, Math.ceil((rest.ends_at - now) / 1000)) : 0;

  useEffect(() => {
    if (!rest || left > 0 || buzzed.current === rest.ends_at) return;
    buzzed.current = rest.ends_at;
    vibrate([200, 100, 200]);
    const id = setTimeout(() => useLiveWorkout.getState().skipRest(), 2500);
    return () => clearTimeout(id);
  }, [rest, left]);

  if (!rest) return null;
  const progress = rest.total_s ? 1 - left / rest.total_s : 1;
  return (
    <View
      className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      accessibilityLiveRegion="polite"
    >
      <View className="mx-auto w-full max-w-[560px] gap-2">
        <View className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <View className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </View>
        <View className="flex-row items-center gap-3">
          <Timer color={colors.ink} size={22} />
          <Text variant="number" className="flex-1" accessibilityLabel={t('train.restLeft', { s: left })}>
            {left > 0 ? formatDuration(left) : t('train.restOver')}
          </Text>
          <PressableScale
            onPress={() => addRest(-15)}
            accessibilityLabel={t('train.restLess')}
            className="h-11 min-w-[52px] items-center justify-center rounded-full bg-surface-2 px-3"
          >
            <Text variant="label">−15</Text>
          </PressableScale>
          <PressableScale
            onPress={() => addRest(15)}
            accessibilityLabel={t('train.restMore')}
            className="h-11 min-w-[52px] items-center justify-center rounded-full bg-surface-2 px-3"
          >
            <Text variant="label">+15</Text>
          </PressableScale>
          <PressableScale
            onPress={skipRest}
            accessibilityLabel={t('train.restSkip')}
            className="h-11 items-center justify-center rounded-full bg-accent px-4"
          >
            <Text variant="label" className="text-on-accent">
              {t('train.skip')}
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

export { vibrate };
