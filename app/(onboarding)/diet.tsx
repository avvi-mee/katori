import { router } from 'expo-router';

import { OptionCard } from '@/components/OptionCard';
import { useOnboarding, type Answers } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

const DIETS: NonNullable<Answers['diet_type']>[] = ['veg', 'egg', 'nonveg', 'jain'];

export default function DietStep() {
  useLocale();
  const diet = useOnboarding((s) => s.diet_type);
  const set = useOnboarding((s) => s.set);

  return (
    <OnboardingShell
      step="diet"
      title={t('onb.diet.title')}
      cta={{
        label: t('common.continue'),
        disabled: !diet,
        onPress: () => {
          track('onboarding_step', { step: 'diet', diet_type: diet });
          router.push('/katori-calibration');
        },
      }}
    >
      {DIETS.map((id) => (
        <OptionCard
          key={id}
          title={t(`diet.${id}`)}
          subtitle={t(`diet.${id}.sub`)}
          selected={diet === id}
          onPress={() => set({ diet_type: id })}
        />
      ))}
    </OnboardingShell>
  );
}
