import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Dumbbell, List, Play, Trophy } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { StreakDots } from '@/components/StreakDots';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { useIsTrainingDay, usePreferences, useTargets } from '@/features/goals/api';
import {
  useExerciseMap,
  usePersonalRecords,
  useTemplates,
  useWorkouts,
  useWorkoutsThisWeek,
} from '@/features/workouts/api';
import { formatDuration } from '@/features/workouts/math';
import { useLiveWorkout } from '@/features/workouts/session';
import { startWorkout, suggestTemplate } from '@/features/workouts/start';
import { t, useLocale } from '@/lib/i18n';
import { useNow } from '@/lib/useNow';

export default function Train() {
  useLocale();
  const { colors } = useTheme();
  const live = useLiveWorkout((s) => s.live);
  const prefs = usePreferences();
  const targets = useTargets();
  const trainingDay = useIsTrainingDay();
  const templates = useTemplates();
  const workouts = useWorkouts();
  const week = useWorkoutsThisWeek();
  const exercises = useExerciseMap();
  const prs = usePersonalRecords();
  const now = useNow();
  const suggested = suggestTemplate(templates.data, workouts.data);
  const coachPlans = templates.data?.filter((x) => x.assigned_by_coach_id) ?? [];
  const mine = templates.data?.filter((x) => x.owner_id && !x.assigned_by_coach_id) ?? [];
  const library = templates.data?.filter((x) => !x.owner_id) ?? [];
  const prCount = (id: string) => (prs.data ?? []).filter((p) => p.workout_id === id && p.kind !== 'volume').length;

  return (
    <Screen className="gap-4">
      <View>
        <Text variant="caption">{t('train.weekCount', { n: week.length, target: targets.workouts_per_week })}</Text>
        <Text variant="display" accessibilityRole="header">
          {t('tabs.train')}
        </Text>
      </View>
      <StreakDots
        label={t('train.weekLabel')}
        days={Array.from({ length: Math.max(targets.workouts_per_week, week.length, 1) }, (_, i) => i < week.length)}
      />

      {live ? (
        <Card className="gap-3 border-accent" enterIndex={0}>
          <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
            {t('train.inProgress')}
          </Text>
          <Text variant="heading">
            {live.name} · {formatDuration((now - Date.parse(live.started_at)) / 1000)}
          </Text>
          <Button
            label={t('train.resume')}
            icon={<Play color={colors.onAccent} size={18} />}
            onPress={() => router.push('/workout/live')}
          />
        </Card>
      ) : (
        <Card className="gap-3" enterIndex={0}>
          <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
            {trainingDay ? t('train.todayPlan') : t('train.restDay')}
          </Text>
          {templates.isLoading ? (
            <Skeleton height={56} radius={16} />
          ) : suggested ? (
            <>
              <Text variant="title">{suggested.name}</Text>
              <Text variant="caption" numberOfLines={2}>
                {suggested.exercises
                  .map((e) => exercises.get(e.exercise_id)?.name)
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Button label={t('train.startThis')} onPress={() => startWorkout(suggested, prefs.default_rest_s)} />
            </>
          ) : null}
          <Button
            label={t('train.startEmpty')}
            variant="secondary"
            onPress={() => startWorkout(null, prefs.default_rest_s)}
          />
        </Card>
      )}

      <PressableScale
        onPress={() => router.push('/workout/exercises')}
        accessibilityLabel={t('train.library')}
        className="min-h-[56px] flex-row items-center gap-3 rounded-card border border-line bg-surface px-4"
      >
        <List color={colors.ink} size={22} />
        <Text variant="heading" className="flex-1">
          {t('train.library')}
        </Text>
        <Text variant="caption">{exercises.size || ''}</Text>
      </PressableScale>

      {[
        { title: t('train.fromCoach'), list: coachPlans },
        { title: t('train.myTemplates'), list: mine },
        { title: t('train.templates'), list: library },
      ].map(({ title, list }) =>
        list.length ? (
          <View key={title} className="gap-2">
            <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
              {title}
            </Text>
            {list.map((tpl) => (
              <PressableScale
                key={tpl.id}
                onPress={() => startWorkout(tpl, prefs.default_rest_s)}
                accessibilityLabel={t('train.startNamed', { name: tpl.name })}
                pressedScale={0.98}
                className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                  <Dumbbell color={colors.ink} size={20} />
                </View>
                <View className="flex-1">
                  <Text variant="heading">{tpl.name}</Text>
                  <Text variant="caption" numberOfLines={1}>
                    {t('train.exerciseCount', { n: tpl.exercises.length })} ·{' '}
                    {tpl.exercises
                      .map((e) => exercises.get(e.exercise_id)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </View>
        ) : null,
      )}

      <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
        {t('train.history')}
      </Text>
      {workouts.isLoading ? (
        <Skeleton height={72} radius={20} />
      ) : !workouts.data?.length ? (
        <Card>
          <Text variant="body" className="text-ink-muted">
            {t('train.noHistory')}
          </Text>
        </Card>
      ) : (
        <View className="gap-2">
          {workouts.data.slice(0, 20).map((w) => (
            <PressableScale
              key={w.id}
              onPress={() => router.push({ pathname: '/workout/summary', params: { id: w.id } })}
              accessibilityLabel={w.name ?? t('train.emptyName')}
              pressedScale={0.98}
              className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
            >
              <View className="flex-1">
                <Text variant="heading">{w.name ?? t('train.emptyName')}</Text>
                <Text variant="caption">
                  {new Date(w.started_at).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {formatDuration(w.duration_s ?? 0)} · {Math.round(w.volume_kg ?? 0).toLocaleString('en-IN')} kg
                  {w.pending ? ` · ${t('sync.pending')}` : ''}
                </Text>
              </View>
              {prCount(w.id) ? (
                <View className="flex-row items-center gap-1 rounded-full bg-accent-soft px-3 py-1">
                  <Trophy color={colors.ink} size={14} />
                  <Text variant="caption" className="font-sans-bold text-ink">
                    {prCount(w.id)}
                  </Text>
                </View>
              ) : null}
            </PressableScale>
          ))}
        </View>
      )}
    </Screen>
  );
}
