import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CountUp } from '@/components/CountUp';
import { Dumbbell, Footprints, Play, Plus } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Ring } from '@/components/Ring';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { stepsOn, useActivityActions, useActivityDays } from '@/features/activity/api';
import { StepsSheet } from '@/features/activity/sheets';
import { HABIT_PRESETS, useHabitActions, useHabitsToday, type Habit } from '@/features/habits/api';
import { formatHabitValue, HABIT_ICON, SmokeLogSheet } from '@/features/habits/ui';
import { useTemplates, useWorkouts, useWorkoutsOn } from '@/features/workouts/api';
import { formatDuration } from '@/features/workouts/math';
import { useLiveWorkout } from '@/features/workouts/session';
import { startWorkout, suggestTemplate } from '@/features/workouts/start';
import { track } from '@/lib/analytics';
import { istDay } from '@/lib/day';
import { t } from '@/lib/i18n';

import { useDailyScore, useIsTrainingDay, usePreferences, useTargets } from './api';
import type { DailyScore, DailyTargets } from './engine';

/** Plain-words reasons for the points left on the table, biggest first. */
function reasons(s: DailyScore, f: { kcal: number; protein: number; steps: number | null }, targets: DailyTargets) {
  return [...s.parts]
    .map((p) => ({ p, missing: p.weight - p.earned }))
    .filter((x) => x.missing >= 2)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 2)
    .map(({ p, missing }) => {
      const pts = Math.round(missing);
      if (p.key === 'food') {
        if (p.note === 'no meals logged') return t('score.noMeals', { pts });
        const gap = Math.round(targets.protein_g - f.protein);
        return gap > 5 ? t('score.protein', { g: gap, pts }) : t('score.kcal', { pts });
      }
      if (p.key === 'training') return t('score.training', { pts });
      if (p.key === 'activity')
        return t('score.steps', { n: Math.max(0, targets.steps - (f.steps ?? 0)).toLocaleString('en-IN'), pts });
      return t('score.habits', { pts });
    });
}

export function ScoreCard({ kcal, protein }: { kcal: number; protein: number }) {
  const { colors } = useTheme();
  const today = istDay();
  const score = useDailyScore(today);
  const targets = useTargets();
  const { data: days } = useActivityDays();
  const steps = stepsOn(days, today);
  const why = reasons(score, { kcal, protein, steps }, targets);
  const mini = [
    { label: t('score.kcalRing'), value: kcal / targets.kcal, text: `${Math.round(kcal)}`, color: colors.accent },
    {
      label: t('macro.protein'),
      value: protein / targets.protein_g,
      text: `${Math.round(protein)} g`,
      color: colors.protein,
    },
    {
      label: t('score.stepsRing'),
      value: (steps ?? 0) / targets.steps,
      text: (steps ?? 0).toLocaleString('en-IN'),
      color: colors.carbs,
    },
  ];
  return (
    <Card className="gap-5 py-5">
      <View className="flex-row items-center gap-4">
        <Ring
          progress={score.score / 100}
          size={128}
          stroke={12}
          accessibilityLabel={t('score.label', { n: score.score })}
        >
          <CountUp variant="hero" value={score.score} />
        </Ring>
        <View className="flex-1 gap-1">
          <Text variant="heading">{t('score.title')}</Text>
          {why.length ? (
            why.map((w) => (
              <Text key={w} variant="caption">
                {w}
              </Text>
            ))
          ) : (
            <Text variant="caption">{t('score.perfect')}</Text>
          )}
        </View>
      </View>
      <View className="flex-row justify-around">
        {mini.map((m) => (
          <View key={m.label} className="items-center gap-1">
            <Ring progress={m.value} size={72} stroke={8} color={m.color} accessibilityLabel={`${m.label}: ${m.text}`}>
              <Text variant="caption" className="font-sans-bold text-ink">
                {Math.round(Math.min(m.value, 9.99) * 100)}%
              </Text>
            </Ring>
            <Text variant="caption">{m.label}</Text>
            <Text variant="label">{m.text}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function WorkoutCard() {
  const { colors } = useTheme();
  const today = istDay();
  const live = useLiveWorkout((s) => s.live);
  const done = useWorkoutsOn(today);
  const trainingDay = useIsTrainingDay(today);
  const prefs = usePreferences();
  const templates = useTemplates();
  const { data: workouts } = useWorkouts();
  const suggested = suggestTemplate(templates.data, workouts);

  if (live)
    return (
      <Card className="flex-row items-center gap-3 border-accent">
        <Dumbbell color={colors.ink} size={22} />
        <Text variant="heading" className="flex-1">
          {t('train.inProgress')}
        </Text>
        <Button
          label={t('train.resume')}
          size="md"
          icon={<Play color={colors.onAccent} size={16} />}
          onPress={() => router.push('/workout/live')}
        />
      </Card>
    );
  if (done.length) {
    const w = done[0]!;
    return (
      <PressableScale
        onPress={() => router.push({ pathname: '/workout/summary', params: { id: w.id } })}
        accessibilityLabel={w.name ?? t('train.emptyName')}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-protein">
          <Dumbbell color="#fff" size={20} />
        </View>
        <View className="flex-1">
          <Text variant="heading">{t('today.workoutDone', { name: w.name ?? t('train.emptyName') })}</Text>
          <Text variant="caption">
            {formatDuration(w.duration_s ?? 0)} · {Math.round(w.volume_kg ?? 0).toLocaleString('en-IN')} kg
          </Text>
        </View>
      </PressableScale>
    );
  }
  return (
    <Card className="gap-3">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {trainingDay ? t('train.todayPlan') : t('train.restDay')}
      </Text>
      {trainingDay && suggested ? <Text variant="title">{suggested.name}</Text> : null}
      <Button
        label={trainingDay && suggested ? t('train.startThis') : t('train.startEmpty')}
        variant={trainingDay ? 'primary' : 'secondary'}
        size="md"
        onPress={() => startWorkout(trainingDay ? suggested : null, prefs.default_rest_s)}
      />
    </Card>
  );
}

export function HabitChips() {
  const { colors } = useTheme();
  const rows = useHabitsToday();
  const { log } = useHabitActions();
  const [smoking, setSmoking] = useState<Habit | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const { data: days } = useActivityDays();
  const { setSteps } = useActivityActions();
  const today = istDay();
  const steps = stepsOn(days, today);
  const prefs = usePreferences();
  const showSteps = prefs.modules.includes('activity');
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {showSteps ? (
          <PressableScale
            onPress={() => setStepsOpen(true)}
            accessibilityLabel={t('activity.addSteps')}
            className="min-h-touch flex-row items-center gap-2 rounded-full border border-line bg-surface px-4"
          >
            <Footprints color={colors.ink} size={18} />
            <Text variant="label">{steps == null ? t('activity.addSteps') : steps.toLocaleString('en-IN')}</Text>
          </PressableScale>
        ) : null}
        {prefs.modules.includes('habits')
          ? (rows ?? []).map(({ habit: h, value, adherence }) => {
              const Icon = HABIT_ICON[h.kind];
              return (
                <PressableScale
                  key={h.id}
                  onPress={async () => {
                    if (h.kind === 'smoking') return setSmoking(h);
                    await log(h.id, HABIT_PRESETS[h.kind].step);
                    track('habit_logged', { kind: h.kind });
                  }}
                  onLongPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                  accessibilityLabel={`${h.name}: ${formatHabitValue(h, value)}. ${t('habits.logOne', { name: h.name })}`}
                  pressedScale={0.94}
                  className={`min-h-touch flex-row items-center gap-2 rounded-full px-4 ${adherence >= 1 && value > 0 ? 'bg-accent-soft' : 'border border-line bg-surface'}`}
                >
                  <Icon color={colors.ink} size={18} />
                  <Text variant="label">
                    {formatHabitValue(h, value)}
                    {h.daily_target ? ` / ${formatHabitValue(h, h.daily_target)}` : ''}
                  </Text>
                </PressableScale>
              );
            })
          : null}
        <PressableScale
          onPress={() => router.push('/habits')}
          accessibilityLabel={t('habits.title')}
          className="min-h-touch flex-row items-center gap-1 rounded-full bg-surface-2 px-4"
        >
          <Plus color={colors.ink} size={16} />
          <Text variant="label">{t('habits.title')}</Text>
        </PressableScale>
      </ScrollView>
      <SmokeLogSheet habit={smoking} open={!!smoking} onClose={() => setSmoking(null)} />
      <StepsSheet
        open={stepsOpen}
        initial={steps}
        onClose={() => setStepsOpen(false)}
        onSave={async (n) => {
          await setSteps(today, n);
          setStepsOpen(false);
        }}
      />
    </>
  );
}
