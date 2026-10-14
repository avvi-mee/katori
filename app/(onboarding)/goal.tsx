import { router } from 'expo-router';
import { Activity, Dumbbell, Flame, Repeat, CigaretteOff, Trophy } from 'lucide-react-native';

import { OptionCard } from '@/components/OptionCard';
import { useTheme } from '@/design/theme';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import type { Goal } from '@/features/goals/targets';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

const GOALS: { id: Goal; Icon: typeof Flame }[] = [
  { id: 'fat_loss', Icon: Flame },
  { id: 'muscle_gain', Icon: Dumbbell },
  { id: 'recomposition', Icon: Repeat },
  { id: 'strength', Icon: Trophy },
  { id: 'endurance', Icon: Activity },
  { id: 'quit_smoking', Icon: CigaretteOff },
];

export default function GoalStep() {
  useLocale();
  const { colors } = useTheme();
  const goal = useOnboarding((s) => s.goal);
  const set = useOnboarding((s) => s.set);

  return (
    <OnboardingShell
      step="goal"
      title={t('onb.goal.title')}
      cta={{
        label: t('common.continue'),
        disabled: !goal,
        onPress: () => {
          track('onboarding_step', { step: 'goal', goal });
          router.push('/body');
        },
      }}
    >
      {GOALS.map(({ id, Icon }) => (
        <OptionCard
          key={id}
          title={t(`goal.${id}`)}
          subtitle={t(`goal.${id}.sub`)}
          selected={goal === id}
          onPress={() => set({ goal: id })}
          icon={<Icon color={goal === id ? colors.accent : colors.inkMuted} size={24} />}
        />
      ))}
    </OnboardingShell>
  );
}
