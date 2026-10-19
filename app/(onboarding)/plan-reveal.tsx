import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { CoachBubble } from '@/components/CoachBubble';
import { CountUp } from '@/components/CountUp';
import { Ring } from '@/components/Ring';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { useUpdateProfile } from '@/features/auth/profile';
import { computeTargets } from '@/features/goals/targets';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';
import { parsePreferences } from '@/types/preferences';

export default function PlanReveal() {
  useLocale();
  const { colors } = useTheme();
  const a = useOnboarding();
  const update = useUpdateProfile();

  const targets = useMemo(
    () =>
      a.sex && a.birth_year && a.height_cm && a.weight_kg && a.activity && a.goal
        ? computeTargets({
            sex: a.sex,
            birthYear: a.birth_year,
            heightCm: a.height_cm,
            weightKg: a.weight_kg,
            activity: a.activity,
            goal: a.goal,
          })
        : null,
    [a.sex, a.birth_year, a.height_cm, a.weight_kg, a.activity, a.goal],
  );

  // Answers can be missing if the page was opened directly; send them back to the start.
  if (!targets) {
    return (
      <OnboardingShell
        step="plan-reveal"
        title={t('onb.plan.title')}
        cta={{ label: t('onb.welcome.cta'), onPress: () => router.replace('/') }}
      >
        <Text variant="body">{t('common.error')}</Text>
      </OnboardingShell>
    );
  }

  const save = () =>
    update.mutate(
      {
        goal: a.goal,
        sex: a.sex,
        birth_year: a.birth_year,
        height_cm: a.height_cm,
        weight_kg: a.weight_kg,
        activity: a.activity,
        diet_type: a.diet_type,
        katori_ml: a.katori_ml,
        plate_size: a.plate_size,
        persona: a.persona,
        savage_mode: a.savage_mode,
        adult_confirmed: a.adult_confirmed,
        locale: a.locale,
        preferences: { ...parsePreferences({}), ...a.training },
        kcal_target: targets.kcal,
        protein_target: targets.protein,
        kcal_floor: targets.floor,
      },
      {
        onSuccess: () => {
          track('onboarding_step', { step: 'plan-reveal', goal: a.goal, diet_type: a.diet_type });
          router.push('/paywall');
        },
        onError: () => toast({ message: t('common.error'), tone: 'error' }),
      },
    );

  return (
    <OnboardingShell
      step="plan-reveal"
      title={t('onb.plan.title')}
      cta={{ label: t('onb.plan.cta'), onPress: save, loading: update.isPending }}
    >
      <View className="items-center py-2">
        <Ring progress={1} size={220} stroke={18} accessibilityLabel={`${targets.kcal} ${t('onb.plan.kcal')}`}>
          <CountUp variant="hero" value={targets.kcal} duration={900} />
          <Text variant="caption">{t('onb.plan.kcal')}</Text>
        </Ring>
      </View>
      <View className="flex-row gap-3">
        <Card enterIndex={1} flex className="items-center">
          <CountUp variant="display" value={targets.protein} style={{ color: colors.protein }} />
          <Text variant="caption">{t('onb.plan.protein')}</Text>
        </Card>
        <Card enterIndex={2} flex className="items-center">
          <CountUp variant="display" value={a.katori_ml} />
          <Text variant="caption">{t('onb.plan.katori')}</Text>
        </Card>
      </View>
      <Text variant="caption" className="text-center">
        {t('onb.plan.floor', { floor: targets.floor.toLocaleString('en-IN') })}
      </Text>
      <CoachBubble
        persona={a.persona}
        text={`${targets.protein} g protein roz. Ek ek katori karke, hum saath mein karenge.`}
      />
    </OnboardingShell>
  );
}
