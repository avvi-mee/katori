import { useEffect, useState } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

type Props = { width?: DimensionValue; height?: number; radius?: number; className?: string };

/** Shimmering placeholder. We never show a bare spinner. */
export function Skeleton({ width = '100%', height = 16, radius = 12, className }: Props) {
  const reduced = useReducedMotion();
  const { scheme } = useTheme();
  const shine = scheme === 'dark' ? 0.07 : 0.7;
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    if (!reduced) x.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1);
    return () => cancelAnimation(x);
  }, [reduced, x]);

  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      className={`overflow-hidden bg-surface-2 ${className ?? ''}`}
      style={{ width, height, borderRadius: radius }}
    >
      {!reduced && (
        <Animated.View style={[band, { position: 'absolute', top: 0, bottom: 0, width: '60%' }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={shine} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#shine)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
