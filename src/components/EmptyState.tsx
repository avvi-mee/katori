import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from './Button';
import { KatoriArt } from './illustrations/Katori';
import { Text } from './Text';

type Props = { title: string; body?: string; action: { label: string; onPress: () => void }; art?: ReactNode };

/** Illustration + one action. Never a blank screen. */
export function EmptyState({ title, body, action, art }: Props) {
  return (
    <View className="items-center gap-3 px-6 py-10">
      {art ?? <KatoriArt fill={0.2} />}
      <Text variant="title" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" className="text-center text-ink-muted">
          {body}
        </Text>
      ) : null}
      <Button label={action.label} onPress={action.onPress} className="mt-2 self-stretch" />
    </View>
  );
}
