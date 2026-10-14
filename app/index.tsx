import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { KatoriArt } from '@/components/illustrations/Katori';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';

// Placeholder entry until auth + onboarding land (Phase 1A step 3).
export default function Index() {
  return (
    <Screen scroll={false} className="justify-center gap-6">
      <View className="items-center gap-4">
        <KatoriArt size={160} />
        <Text variant="hero" className="text-center">
          Katori
        </Text>
        <Text variant="body" className="text-center text-ink-muted">
          Snap your thali. Hit your protein.
        </Text>
      </View>
      {__DEV__ ? (
        <Button label="Component gallery" variant="secondary" onPress={() => router.push('/dev/components')} />
      ) : null}
    </Screen>
  );
}
