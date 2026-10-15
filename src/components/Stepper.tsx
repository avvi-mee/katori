import { Minus, Plus } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  label: string;
};

/** − value + with 44px buttons. */
export function Stepper({ value, onChange, step, min, max, format, label }: Props) {
  const { colors } = useTheme();
  const clamp = (v: number) => Math.min(Math.max(Math.round(v / step) * step, min), max);
  const button = (dir: -1 | 1) => (
    <PressableScale
      onPress={() => onChange(clamp(value + dir * step))}
      disabled={dir < 0 ? value <= min : value >= max}
      accessibilityLabel={`${dir < 0 ? 'Less' : 'More'} ${label}`}
      pressedScale={0.9}
      className={`h-12 w-12 items-center justify-center rounded-full bg-surface-2 ${(dir < 0 ? value <= min : value >= max) ? 'opacity-40' : ''}`}
    >
      {dir < 0 ? <Minus color={colors.ink} size={22} /> : <Plus color={colors.ink} size={22} />}
    </PressableScale>
  );
  return (
    <View
      className="flex-row items-center justify-between"
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuetext={format(value)}
    >
      {button(-1)}
      <Text variant="number" className="flex-1 text-center">
        {format(value)}
      </Text>
      {button(1)}
    </View>
  );
}
