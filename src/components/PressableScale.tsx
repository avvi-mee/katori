import { cssInterop } from 'nativewind';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { animateTo, useReducedMotion } from '@/design/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: 'style' });

type Props = PressableProps & { className?: string; pressedScale?: number };

/** Pressable with the doc's tap feel: quick spring scale-down, skipped under reduced motion. */
export function PressableScale({ pressedScale = 0.97, style, onPressIn, onPressOut, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={(e) => {
        if (!reduced) scale.value = animateTo(pressedScale, false);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = animateTo(1, reduced);
        onPressOut?.(e);
      }}
      style={[animated, style as object]}
      {...rest}
    />
  );
}
