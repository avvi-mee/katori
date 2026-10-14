import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { CoachBubble } from '@/components/CoachBubble';
import { OptionCard } from '@/components/OptionCard';
import { Sheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { Text } from '@/components/Text';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { PERSONAS, personaMeta } from '@/features/personas/personas';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

export default function CoachPicker() {
  useLocale();
  const { persona, savage_mode, adult_confirmed, set } = useOnboarding();
  const [askAdult, setAskAdult] = useState(false);

  const toggleSavage = (on: boolean) => {
    if (!on) return set({ savage_mode: false });
    // Savage mode is off by default and gated behind an explicit 18+ confirmation.
    if (adult_confirmed) return set({ savage_mode: true });
    setAskAdult(true);
  };

  return (
    <OnboardingShell
      step="coach-picker"
      title={t('onb.coach.title')}
      subtitle={t('onb.coach.body')}
      cta={{
        label: t('common.continue'),
        onPress: () => {
          track('onboarding_step', { step: 'coach-picker' });
          router.push('/plan-reveal');
        },
      }}
    >
      {PERSONAS.map((id) => (
        <View key={id} className="gap-3">
          <OptionCard
            title={personaMeta[id].name}
            subtitle={personaMeta[id].voice}
            selected={persona === id}
            onPress={() => set({ persona: id, savage_mode: id === 'gym_bro' ? savage_mode : false })}
          />
          {persona === id ? (
            <View className="gap-3 pl-2">
              <CoachBubble persona={id} text={personaMeta[id].sample} />
              {id === 'gym_bro' ? (
                <Switch
                  label={t('onb.coach.savage')}
                  description={t('onb.coach.savageDesc')}
                  value={savage_mode}
                  onChange={toggleSavage}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      <Sheet open={askAdult} onClose={() => setAskAdult(false)} title={t('onb.coach.adultTitle')}>
        <Text variant="body" className="mb-6 text-ink-muted">
          {t('onb.coach.adultBody')}
        </Text>
        <View className="gap-2">
          <Button
            label={t('onb.coach.adultYes')}
            onPress={() => {
              set({ adult_confirmed: true, savage_mode: true });
              setAskAdult(false);
            }}
          />
          <Button label={t('onb.coach.adultNo')} variant="ghost" onPress={() => setAskAdult(false)} />
        </View>
      </Sheet>
    </OnboardingShell>
  );
}
