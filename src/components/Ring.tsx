import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { animateTo, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0..1; values above 1 draw a full ring. */
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  accessibilityLabel: string;
};

/** Progress ring that springs from its previous value to the new one after every save. */
export function Ring({ progress, size = 200, stroke = 16, color, children, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = animateTo(Math.max(0, Math.min(progress, 1)), reduced);
  }, [progress, reduced, p]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - p.value) }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(progress, 1) * 100)}
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface2} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}
