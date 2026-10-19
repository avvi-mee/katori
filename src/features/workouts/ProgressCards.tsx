import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { LineChart } from '@/components/LineChart';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { useEntitlement } from '@/features/billing/entitlement';
import { useWeights } from '@/features/body/api';
import { useHabitLogs, useHabits } from '@/features/habits/api';
import { habitStreak, smokeFreeDays } from '@/features/habits/math';
import { HABIT_ICON } from '@/features/habits/ui';
import { istDay } from '@/lib/day';
import { t } from '@/lib/i18n';

import { useExerciseMap, useWorkouts } from './api';
import { titleCase } from './format';
import { e1rmSeries, volumePerMuscle } from './math';

const short = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** e1RM line for the lifts the user trains most. */
export function StrengthCard() {
  const { data: workouts } = useWorkouts();
  const exercises = useExerciseMap();
  const lifts = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of workouts ?? [])
      for (const id of new Set(w.sets.filter((s) => (s.kg ?? 0) > 0).map((s) => s.exercise_id)))
        count.set(id, (count.get(id) ?? 0) + 1);
    return [...count]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);
  }, [workouts]);
  const [pick, setPick] = useState<string | null>(null);
  const lift = pick && lifts.includes(pick) ? pick : lifts[0];
  if (!workouts || !lift) return null;
  const series = e1rmSeries(workouts, lift);
  return (
    <Card className="gap-3">
      <Text variant="heading">{t('progress.strength')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChipRow
          wrap={false}
          accessibilityLabel={t('progress.lift')}
          options={lifts.map((id) => ({ id, label: exercises.get(id)?.name ?? t('train.exercise') }))}
          value={lift}
          onChange={setPick}
        />
      </ScrollView>
      <LineChart
        points={series.map((p) => ({ label: short(p.date), value: p.value }))}
        unit=" kg"
        accessibilityLabel={t('progress.e1rmOf', { name: exercises.get(lift)?.name ?? '' })}
      />
      <Text variant="caption">{t('progress.e1rmNote')}</Text>
    </Card>
  );
}

/** Pro: weekly working sets per muscle. Free users see what it is and a way to unlock it. */
export function VolumeCard() {
  const { colors } = useTheme();
  const { isPro } = useEntitlement();
  const { data: workouts } = useWorkouts();
  const exercises = useExerciseMap();
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = useMemo(
    () => (workouts ? volumePerMuscle(workouts, (id) => exercises.get(id)?.primary_muscles ?? [], from) : []),
    [workouts, exercises, from],
  );
  if (!workouts?.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.sets));
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="heading">{t('progress.volume')}</Text>
        <View className="rounded-full bg-accent-soft px-2 py-0.5">
          <Text variant="caption" className="font-sans-bold text-ink">
            PRO
          </Text>
        </View>
      </View>
      {isPro ? (
        rows.length ? (
          rows.map((r) => (
            <View key={r.muscle} className="gap-1">
              <View className="flex-row justify-between">
                <Text variant="label">{titleCase(r.muscle)}</Text>
                <Text variant="caption">
                  {t('progress.setsVolume', { n: r.sets, kg: Math.round(r.volume).toLocaleString('en-IN') })}
                </Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-surface-2">
                <View style={{ width: `${(r.sets / max) * 100}%`, height: '100%', backgroundColor: colors.accent }} />
              </View>
            </View>
          ))
        ) : (
          <Text variant="caption">{t('progress.noVolume')}</Text>
        )
      ) : (
        <>
          <Text variant="body" className="text-ink-muted">
            {t('progress.volumePitch')}
          </Text>
          <Button label={t('me.upgrade')} size="md" onPress={() => router.push('/paywall?from=progress')} />
        </>
      )}
    </Card>
  );
}

export function WeightCard() {
  const { data } = useWeights();
  if (!data || data.length < 2) return null;
  const pts = data.slice(-60);
  const delta = pts.at(-1)!.weight_kg - pts[0]!.weight_kg;
  return (
    <Card className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text variant="heading">{t('body.weightTrend')}</Text>
        <Text variant="caption">{`${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg`}</Text>
      </View>
      <LineChart
        points={pts.map((w) => ({ label: short(`${w.date}T12:00:00Z`), value: w.weight_kg }))}
        unit=" kg"
        accessibilityLabel={t('body.weightTrend')}
      />
      <Button label={t('fab.weight')} variant="ghost" size="md" onPress={() => router.push('/body')} />
    </Card>
  );
}

export function HabitStreaksCard() {
  const { colors } = useTheme();
  const { data: habits } = useHabits();
  const { data: logs } = useHabitLogs();
  const today = istDay();
  if (!habits?.length) return null;
  return (
    <Card className="gap-3">
      <Text variant="heading">{t('progress.habits')}</Text>
      {habits.map((h) => {
        const mine = (logs ?? []).filter((l) => l.habit_id === h.id);
        const n =
          h.kind === 'smoking'
            ? smokeFreeDays(mine, h.created_at, today)
            : habitStreak(h.kind, mine, h.daily_target, h.created_at, today);
        const Icon = HABIT_ICON[h.kind];
        return (
          <View key={h.id} className="flex-row items-center gap-3">
            <Icon color={colors.ink} size={20} />
            <Text variant="body" className="flex-1">
              {h.name}
            </Text>
            <Text variant="label">
              {h.kind === 'smoking' ? t('habits.smokeFree', { n }) : t('habits.streak', { n })}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
