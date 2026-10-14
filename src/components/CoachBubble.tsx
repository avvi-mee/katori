import { View } from 'react-native';
import Animated, { FadeInUp, ReduceMotion } from 'react-native-reanimated';

import { duration } from '@/design/motion';
import { personaMeta, type PersonaId } from '@/features/personas/personas';

import { Text } from './Text';

type Props = { persona: PersonaId; text: string; gentle?: boolean };

export function CoachBubble({ persona, text, gentle }: Props) {
  const meta = personaMeta[persona];
  return (
    <Animated.View entering={FadeInUp.duration(duration.card).reduceMotion(ReduceMotion.System)}>
      <View className="flex-row items-end gap-3" accessible accessibilityLabel={`${meta.name} says: ${text}`}>
        <View className={`h-11 w-11 items-center justify-center rounded-full ${gentle ? 'bg-protein' : 'bg-accent'}`}>
          <Text variant="label" className="text-on-accent">
            {meta.initials}
          </Text>
        </View>
        <View className="flex-1 rounded-card rounded-bl-md border border-line bg-surface px-4 py-3">
          <Text variant="caption" className="mb-0.5">
            {meta.name}
          </Text>
          <Text variant="body">{text}</Text>
        </View>
      </View>
    </Animated.View>
  );
}
