import { View } from 'react-native';

import { Text } from './Text';

/** Honest output: "480–540 kcal". */
export function RangeBadge({ low, high, unit = 'kcal' }: { low: number; high: number; unit?: string }) {
  const lo = Math.round(low);
  const hi = Math.round(high);
  return (
    <View
      accessible
      accessibilityLabel={`${lo} to ${hi} ${unit}`}
      className="self-start rounded-full bg-accent-soft px-3 py-1.5"
    >
      <Text variant="label">
        {lo === hi ? lo : `${lo}–${hi}`} {unit}
      </Text>
    </View>
  );
}
