import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { ChipRow } from '@/components/ChipRow';
import { OptionCard } from '@/components/OptionCard';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import type { Activity, Sex } from '@/features/goals/targets';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

const YEAR = new Date().getFullYear();
const MIN_YEAR = YEAR - 90;
const MAX_YEAR = YEAR - 13;
const ACTIVITIES: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

const num = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => Number(s))
    .pipe(z.number().min(min).max(max));

const Schema = z.object({
  sex: z.enum(['male', 'female', 'other']),
  birth_year: num(MIN_YEAR, MAX_YEAR),
  height_cm: num(120, 230),
  weight_kg: num(30, 250),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
});
type FormIn = z.input<typeof Schema>;
type FormOut = z.output<typeof Schema>;

export default function BodyStep() {
  useLocale();
  const saved = useOnboarding();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(Schema),
    mode: 'onTouched',
    defaultValues: {
      sex: saved.sex,
      birth_year: saved.birth_year?.toString() ?? '',
      height_cm: saved.height_cm?.toString() ?? '',
      weight_kg: saved.weight_kg?.toString() ?? '',
      activity: saved.activity,
    },
  });
  const sex = form.watch('sex');
  const activity = form.watch('activity');

  const submit = form.handleSubmit((v) => {
    saved.set(v);
    track('onboarding_step', { step: 'body' });
    router.push('/diet');
  });

  const field = (name: 'birth_year' | 'height_cm' | 'weight_kg', label: string, suffix: string, err: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field: f, fieldState }) => (
        <TextField
          label={label}
          suffix={suffix}
          value={f.value}
          onChangeText={(v) => f.onChange(v.replace(/[^\d.]/g, ''))}
          onBlur={f.onBlur}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxLength={5}
          error={fieldState.error ? err : undefined}
        />
      )}
    />
  );

  return (
    <OnboardingShell
      step="body"
      title={t('onb.body.title')}
      subtitle={t('onb.body.body')}
      cta={{ label: t('common.continue'), onPress: submit, disabled: !sex || !activity }}
    >
      <View className="gap-2">
        <Text variant="label">{t('onb.body.sex')}</Text>
        <ChipRow
          accessibilityLabel={t('onb.body.sex')}
          options={(['male', 'female', 'other'] as Sex[]).map((id) => ({ id, label: t(`sex.${id}`) }))}
          value={sex ?? ''}
          onChange={(id) => form.setValue('sex', id as Sex, { shouldValidate: true })}
        />
      </View>
      {field('birth_year', t('onb.body.birthYear'), '', t('onb.body.errYear', { min: MIN_YEAR, max: MAX_YEAR }))}
      <View className="flex-row gap-3">
        <View className="flex-1">{field('height_cm', t('onb.body.height'), 'cm', t('onb.body.errHeight'))}</View>
        <View className="flex-1">{field('weight_kg', t('onb.body.weight'), 'kg', t('onb.body.errWeight'))}</View>
      </View>
      <Text variant="heading" className="mt-4">
        {t('onb.body.activity')}
      </Text>
      {ACTIVITIES.map((id) => (
        <OptionCard
          key={id}
          title={t(`activity.${id}`)}
          subtitle={t(`activity.${id}.sub`)}
          selected={activity === id}
          onPress={() => form.setValue('activity', id, { shouldValidate: true })}
        />
      ))}
    </OnboardingShell>
  );
}
