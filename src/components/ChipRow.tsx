import { View } from 'react-native';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Option = { id: string; label: string };
type Props = {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel: string;
  /** false keeps chips on one line (e.g. inside a horizontal ScrollView). */
  wrap?: boolean;
};

/** Single-select chips (radio group). Every chip is at least 44px tall. */
export function ChipRow({ options, value, onChange, accessibilityLabel, wrap = true }: Props) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className={`flex-row gap-2 ${wrap ? 'flex-wrap' : ''}`}
    >
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <PressableScale
            key={o.id}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.id)}
            pressedScale={0.94}
            className={`min-h-touch min-w-touch items-center justify-center rounded-full px-4 ${
              selected ? 'bg-accent' : 'border border-line bg-surface-2'
            }`}
          >
            <Text variant="label" className={selected ? 'text-on-accent' : 'text-ink'}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
