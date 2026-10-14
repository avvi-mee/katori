import { View } from 'react-native';

/** One dot per day, oldest first; filled = goal hit. */
export function StreakDots({ days, label }: { days: boolean[]; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${days.filter(Boolean).length} of ${days.length}`}
      className="flex-row gap-1.5"
    >
      {days.map((hit, i) => (
        <View key={i} className={`h-3 w-3 rounded-full ${hit ? 'bg-protein' : 'border border-line bg-surface-2'}`} />
      ))}
    </View>
  );
}
