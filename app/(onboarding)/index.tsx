import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { CoachBubble } from '@/components/CoachBubble';
import { KatoriArt } from '@/components/illustrations/Katori';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useOnboarding } from '@/features/auth/onboarding';
import { track } from '@/lib/analytics';
import { setLocale, t, useLocale, type Locale } from '@/lib/i18n';

export default function Welcome() {
  const locale = useLocale();
  const set = useOnboarding((s) => s.set);
  const insets = useSafeAreaInsets();

  return (
    <Screen scroll={false} className="justify-between">
      <View className="flex-1 justify-center gap-5">
        <KatoriArt size={180} />
        <Text variant="hero">{t('onb.welcome.title')}</Text>
        <Text variant="body" className="text-ink-muted">
          {t('onb.welcome.body')}
        </Text>
        <CoachBubble persona="hype_friend" text="Chal, pehle tera plan banate hain. 1 minute lagega!" />
      </View>
      <View className="gap-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="gap-2">
          <Text variant="caption">{t('onb.language')}</Text>
          <ChipRow
            accessibilityLabel={t('onb.language')}
            options={[
              { id: 'en', label: 'English' },
              { id: 'hinglish', label: 'Hinglish' },
            ]}
            value={locale}
            onChange={(id) => {
              setLocale(id as Locale);
              set({ locale: id as Locale });
            }}
          />
        </View>
        <Button
          label={t('onb.welcome.cta')}
          onPress={() => {
            track('onboarding_step', { step: 'welcome' });
            router.push('/goal');
          }}
        />
      </View>
    </Screen>
  );
}
