import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/design/motion';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const box: Record<Variant, string> = {
  primary: 'bg-accent',
  secondary: 'bg-surface border border-line',
  ghost: 'bg-transparent',
  danger: 'bg-surface border border-fat',
};
const label: Record<Variant, string> = {
  primary: 'text-on-accent',
  secondary: 'text-ink',
  ghost: 'text-ink',
  danger: 'text-fat',
};

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
  accessibilityHint?: string;
};

export function Button({
  label: text,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  size = 'lg',
  className,
  accessibilityHint,
}: Props) {
  const inactive = disabled || loading;
  return (
    <PressableScale
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityLabel={text}
      accessibilityHint={accessibilityHint}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      className={`${box[variant]} ${size === 'lg' ? 'min-h-[52px] px-6' : 'min-h-touch px-4'} flex-row items-center justify-center gap-2 rounded-full ${disabled ? 'opacity-40' : ''} ${className ?? ''}`}
    >
      {icon}
      {loading ? (
        <Pulse className={label[variant]} />
      ) : (
        <Text variant="label" className={label[variant]}>
          {text}
        </Text>
      )}
    </PressableScale>
  );
}

/** Three breathing dots instead of a spinner. */
function Pulse({ className }: { className: string }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.3, { duration: 500 }), -1, true);
    return () => cancelAnimation(o);
  }, [reduced, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={style}>
      <View className="flex-row gap-1.5">
        {[0, 1, 2].map((i) => (
          <Text key={i} variant="label" className={className}>
            •
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}
