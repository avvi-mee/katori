import { router } from 'expo-router';
import { View } from 'react-native';

import { CoachBubble } from '@/components/CoachBubble';
import { OptionCard } from '@/components/OptionCard';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { PERSONAS, personaMeta } from '@/features/personas/personas';
import { SavageSwitch } from '@/features/personas/SavageSwitch';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

export default function CoachPicker() {
  useLocale();
  const { persona, savage_mode, adult_confirmed, set } = useOnboarding();

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
                <SavageSwitch value={savage_mode} adultConfirmed={adult_confirmed} onChange={set} />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </OnboardingShell>
  );
}
