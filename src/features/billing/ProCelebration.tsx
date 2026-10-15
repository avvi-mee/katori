import { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { ThemeVars, useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { useCelebration } from './entitlement';

const DOTS = Array.from({ length: 14 }, (_, i) => i);

/** Shown once, the moment Pro becomes active. Burst of saffron/leaf/turmeric dots (no animation under reduced motion). */
export function ProCelebration() {
  const { show, set } = useCelebration();
  const { colors } = useTheme();
  const palette = [colors.accent, colors.protein, colors.carbs];

  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => set(false), 6000);
    return () => clearTimeout(id);
  }, [show, set]);

  if (!show) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => set(false)}>
      <ThemeVars>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => set(false)}
          accessibilityLabel={t('common.close')}
        >
          <View className="flex-1 items-center justify-center px-6">
            <View className="absolute items-center justify-center">
              {DOTS.map((i) => {
                const angle = (i / DOTS.length) * Math.PI * 2;
                return (
                  <Animated.View
                    key={i}
                    entering={ZoomIn.delay(i * 25)
                      .springify()
                      .damping(12)
                      .reduceMotion(ReduceMotion.System)}
                    style={{
                      position: 'absolute',
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: palette[i % palette.length],
                      transform: [{ translateX: Math.cos(angle) * 165 }, { translateY: Math.sin(angle) * 210 }],
                    }}
                  />
                );
              })}
            </View>
            <Animated.View
              entering={ZoomIn.springify().damping(14).reduceMotion(ReduceMotion.System)}
              style={{ width: '100%', maxWidth: 360 }}
            >
              <View className="items-center gap-3 rounded-sheet bg-surface p-6">
                <Text variant="display">{t('pro.welcome')}</Text>
                <Text variant="body" className="text-center text-ink-muted">
                  {t('pro.welcomeBody')}
                </Text>
                <Button label={t('pro.letsGo')} onPress={() => set(false)} className="mt-2 self-stretch" />
              </View>
            </Animated.View>
          </View>
        </Pressable>
      </ThemeVars>
    </Modal>
  );
}
