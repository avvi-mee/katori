import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { ChevronLeft } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Switch } from '@/components/Switch';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useGoalsRow, usePreferences, useSaveGoals, useSavePreferences, useTargets } from '@/features/goals/api';
import type { Goal } from '@/features/goals/targets';
import { TrainingSetup, type TrainingPrefs } from '@/features/goals/TrainingSetup';
import { t, useLocale, type MessageKey } from '@/lib/i18n';
import { TodayModule, type Preferences } from '@/types/preferences';

const GOALS: Goal[] = ['fat_loss', 'muscle_gain', 'recomposition', 'strength', 'endurance', 'quit_smoking'];
const FIELDS = [
  { key: 'kcal', label: 'goals.kcal', suffix: 'kcal' },
  { key: 'protein_g', label: 'goals.protein', suffix: 'g' },
  { key: 'workouts_per_week', label: 'goals.workouts', suffix: '/wk' },
  { key: 'steps', label: 'goals.steps', suffix: '' },
  { key: 'water_ml', label: 'goals.water', suffix: 'ml' },
  { key: 'sleep_h', label: 'goals.sleep', suffix: 'h' },
  { key: 'smoking_limit', label: 'goals.smoking', suffix: '/day' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];
const RANGE: Record<FieldKey, [number, number]> = {
  kcal: [800, 6000],
  protein_g: [20, 400],
  workouts_per_week: [0, 7],
  steps: [0, 100000],
  water_ml: [0, 10000],
  sleep_h: [0, 14],
  smoking_limit: [0, 100],
};

/** Goals (one primary goal + targets) and the preferences that shape every screen. */
export default function Goals() {
  useLocale();
  const { colors } = useTheme();
  const { data: goals } = useGoalsRow();
  const targets = useTargets();
  const prefs = usePreferences();
  const saveGoals = useSaveGoals();
  const savePrefs = useSavePreferences();
  const [primary, setPrimary] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});
  const [training, setTraining] = useState<TrainingPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPrimary(goals?.primary_goal ?? null), [goals?.primary_goal]);

  const invalid = FIELDS.some(({ key }) => {
    const v = draft[key];
    if (v === undefined || v.trim() === '') return false;
    const n = Number(v);
    return Number.isNaN(n) || n < RANGE[key][0] || n > RANGE[key][1];
  });

  const save = async () => {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { primary_goal: primary };
      for (const { key } of FIELDS) {
        const v = draft[key];
        if (v !== undefined)
          patch[key] = v.trim() === '' ? null : key === 'sleep_h' ? Number(v) : Math.round(Number(v));
      }
      await saveGoals(patch);
      if (training) await savePrefs(training);
      setDraft({});
      setTraining(null);
      toast({ message: t('goals.saved'), tone: 'success' });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const setPref = (patch: Partial<Preferences>) =>
    savePrefs(patch).catch(() => toast({ message: t('common.error'), tone: 'error' }));

  return (
    <Screen className="gap-4">
      <View className="flex-row items-center gap-1">
        <PressableScale
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/me'))}
          accessibilityLabel={t('common.back')}
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </PressableScale>
        <Text variant="display" accessibilityRole="header">
          {t('goals.title')}
        </Text>
      </View>

      <Card className="gap-3">
        <Text variant="heading">{t('goals.primary')}</Text>
        <ChipRow
          accessibilityLabel={t('goals.primary')}
          options={GOALS.map((g) => ({ id: g, label: t(`goal.${g}` as MessageKey) }))}
          value={primary ?? ''}
          onChange={setPrimary}
        />
      </Card>

      <Card className="gap-3">
        <Text variant="heading">{t('goals.targets')}</Text>
        <Text variant="caption">{t('goals.targetsHint')}</Text>
        {goals?.updated_by === 'engine' ? <Text variant="caption">{t('goals.engineUpdated')}</Text> : null}
        <View className="flex-row flex-wrap gap-3">
          {FIELDS.map(({ key, label, suffix }) => {
            const current = goals?.[key];
            const fallback =
              key === 'smoking_limit'
                ? targets.smoking_limit
                : targets[key === 'workouts_per_week' ? 'workouts_per_week' : key];
            return (
              <View key={key} className="min-w-[140px] flex-1">
                <TextField
                  label={t(label)}
                  value={draft[key] ?? (current == null ? '' : String(current))}
                  placeholder={fallback == null ? '–' : String(fallback)}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  suffix={suffix}
                />
              </View>
            );
          })}
        </View>
      </Card>

      <Card className="gap-3">
        <Text variant="heading">{t('goals.training')}</Text>
        <TrainingSetup
          showWeekdays
          value={training ?? prefs}
          onChange={(patch) => setTraining({ ...(training ?? prefs), ...patch })}
        />
      </Card>

      <Button
        label={t('common.save')}
        loading={busy}
        disabled={invalid || (!Object.keys(draft).length && !training && primary === (goals?.primary_goal ?? null))}
        onPress={save}
      />

      <Card className="gap-4">
        <Text variant="heading">{t('goals.modules')}</Text>
        {TodayModule.options
          .filter((m) => m !== 'food')
          .map((m) => (
            <Switch
              key={m}
              label={t(`goals.module.${m}`)}
              value={prefs.modules.includes(m)}
              onChange={(on) => setPref({ modules: on ? [...prefs.modules, m] : prefs.modules.filter((x) => x !== m) })}
            />
          ))}
      </Card>

      <Card className="gap-4">
        <Text variant="heading">{t('goals.workoutPrefs')}</Text>
        <View className="gap-2">
          <Text variant="label">{t('goals.defaultRest')}</Text>
          <ChipRow
            accessibilityLabel={t('goals.defaultRest')}
            options={[60, 90, 120, 180].map((s) => ({ id: String(s), label: `${s}s` }))}
            value={String(prefs.default_rest_s)}
            onChange={(s) => setPref({ default_rest_s: Number(s) })}
          />
        </View>
        <Switch
          label={t('goals.addBurn')}
          value={prefs.add_burn_to_targets}
          onChange={(add_burn_to_targets) => setPref({ add_burn_to_targets })}
        />
        <Text variant="caption">{t('goals.addBurnHint')}</Text>
      </Card>
    </Screen>
  );
}
