import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

const PIECES = 28;

function Piece({ i, width, color }: { i: number; width: number; color: string }) {
  const p = useSharedValue(0);
  // Deterministic spread per piece: no Math.random, so renders are stable.
  const x0 = ((i * 37) % 100) / 100;
  const drift = (((i * 53) % 21) - 10) * 6;
  const spin = ((i * 29) % 5) * 180 + 180;
  useEffect(() => {
    p.value = withDelay((i % 7) * 60, withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }));
  }, [p, i]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value * p.value,
    transform: [
      { translateX: x0 * width + drift * p.value },
      { translateY: -20 + p.value * 520 },
      { rotate: `${spin * p.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      <View style={{ width: 8, height: i % 2 ? 14 : 8, borderRadius: i % 3 ? 2 : 4, backgroundColor: color }} />
    </Animated.View>
  );
}

/** One short burst for PRs. Nothing at all under reduced motion. */
export function Confetti() {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  if (reduced) return null;
  const palette = [colors.accent, colors.protein, colors.carbs, colors.fat];
  return (
    <View pointerEvents="none" aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} i={i} width={Math.min(width, 560)} color={palette[i % palette.length]!} />
      ))}
    </View>
  );
}
