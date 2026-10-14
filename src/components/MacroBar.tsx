import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay } from 'react-native-reanimated';

import { animateTo, useReducedMotion } from '@/design/motion';

import { Text } from './Text';

type Props = {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
  /** Position in a group; bars fill with a slight stagger. */
  index?: number;
};

export function MacroBar({ label, value, target, color, unit = 'g', index = 0 }: Props) {
  const reduced = useReducedMotion();
  const w = useSharedValue(0);
  const pct = target > 0 ? Math.min(value / target, 1) : 0;

  useEffect(() => {
    w.value = withDelay(reduced ? 0 : index * 70, animateTo(pct, reduced));
  }, [pct, index, reduced, w]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${Math.round(value)} of ${Math.round(target)} ${unit}`}
      className="gap-1.5"
    >
      <View className="flex-row items-baseline justify-between">
        <Text variant="label">{label}</Text>
        <Text variant="caption">
          <Text variant="label">{Math.round(value)}</Text> / {Math.round(target)} {unit}
        </Text>
      </View>
      <View className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <Animated.View style={[fill, { height: '100%', borderRadius: 999, backgroundColor: color }]} />
      </View>
    </View>
  );
}
