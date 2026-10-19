import { router } from 'expo-router';

import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { TrainingSetup } from '@/features/goals/TrainingSetup';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

export default function TrainingStep() {
  useLocale();
  const training = useOnboarding((s) => s.training);
  const set = useOnboarding((s) => s.set);
  return (
    <OnboardingShell
      step="training"
      title={t('setup.title')}
      subtitle={t('setup.subtitle')}
      cta={{
        label: t('common.continue'),
        onPress: () => {
          track('onboarding_step', { step: 'training' });
          router.push('/katori-calibration');
        },
      }}
    >
      <TrainingSetup value={training} onChange={(patch) => set({ training: { ...training, ...patch } })} />
    </OnboardingShell>
  );
}
