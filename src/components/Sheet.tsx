import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { animateTo, duration, useReducedMotion } from '@/design/motion';
import { ThemeVars } from '@/design/theme';

import { Text } from './Text';

const OFFSCREEN = 1000;

type Props = { open: boolean; onClose: () => void; title?: string; children: ReactNode };

/** Bottom sheet for edits: springs up, drag down or tap the backdrop to close. */
export function Sheet({ open, onClose, title, children }: Props) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = animateTo(0, reduced);
      backdrop.value = withTiming(1, { duration: duration.card });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: duration.card });
      y.value = withTiming(OFFSCREEN, { duration: duration.card }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) scheduleOnRN(onClose);
      else y.value = animateTo(0, reduced);
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value * 0.45 }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeVars>
          <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000' }, backdropStyle]}>
            <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
          </Animated.View>
          <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <Animated.View style={panelStyle} accessibilityViewIsModal aria-modal>
              <View
                className="mx-auto w-full max-w-[560px] rounded-t-sheet bg-surface px-5 pt-2"
                style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
              >
                <GestureDetector gesture={pan}>
                  <View className="min-h-touch items-center justify-center" accessibilityLabel="Drag to close">
                    <View className="h-1.5 w-10 rounded-full bg-line" />
                  </View>
                </GestureDetector>
                {title ? (
                  <Text variant="title" className="mb-4" accessibilityRole="header">
                    {title}
                  </Text>
                ) : null}
                {children}
              </View>
            </Animated.View>
          </View>
        </ThemeVars>
      </GestureHandlerRootView>
    </Modal>
  );
}
