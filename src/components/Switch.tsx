import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { animateTo, useReducedMotion } from '@/design/motion';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = { label: string; description?: string; value: boolean; onChange: (v: boolean) => void };

export function Switch({ label, description, value, onChange }: Props) {
  const reduced = useReducedMotion();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = animateTo(value ? 1 : 0, reduced);
  }, [value, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));

  return (
    <PressableScale
      accessibilityRole="switch"
      aria-checked={value}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      pressedScale={0.99}
      className="min-h-touch flex-row items-center gap-3 py-1"
    >
      <View className="flex-1">
        <Text variant="label">{label}</Text>
        {description ? <Text variant="caption">{description}</Text> : null}
      </View>
      <View className={`h-8 w-[52px] justify-center rounded-full px-1 ${value ? 'bg-accent' : 'bg-line'}`}>
        <Animated.View style={knob}>
          <View className="h-6 w-6 rounded-full bg-surface" />
        </Animated.View>
      </View>
    </PressableScale>
  );
}
