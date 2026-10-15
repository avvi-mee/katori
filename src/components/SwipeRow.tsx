import { Trash2 } from '@/components/icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { animateTo, duration, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

const THRESHOLD = -90;

type Props = { children: ReactNode; onDelete: () => void; deleteLabel: string };

/** Swipe left to delete. Screen readers get a "delete" action instead of the gesture. */
export function SwipeRow({ children, onDelete, deleteLabel }: Props) {
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const x = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      x.value = Math.min(0, e.translationX);
    })
    .onEnd(() => {
      if (x.value < THRESHOLD) {
        x.value = withTiming(-600, { duration: duration.card }, (done) => {
          if (done) scheduleOnRN(onDelete);
        });
      } else x.value = animateTo(0, reduced);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const binStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, -x.value / 60) }));

  return (
    <View
      className="overflow-hidden rounded-card"
      accessible
      accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            inset: 0,
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingRight: 24,
            backgroundColor: colors.fat,
          },
          binStyle,
        ]}
      >
        <Trash2 color="#FFFFFF" size={22} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
