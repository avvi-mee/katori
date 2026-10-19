import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, ChevronRight, MessageSquare, Trophy } from '@/components/icons';
import { LineChart } from '@/components/LineChart';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { WeekBars } from '@/components/WeekBars';
import { useTheme } from '@/design/theme';
import { intakeByDay, useClientDetail, useMealComments, useSetClientTargets } from '@/features/coach/api';
import { adherentDays, plannedSoFar, weekStart } from '@/features/coach/flags';
import { habitStreak, recentAverage, smokeFreeDays } from '@/features/habits/math';
import { formatDuration } from '@/features/workouts/math';
import { addDays, istDay } from '@/lib/day';
import { COACH_HOME } from '@/lib/routes';
import { t, useLocale, type MessageKey } from '@/lib/i18n';

const weekday = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' });

export default function ClientDetail() {
  useLocale();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = istDay();
  const q = useClientDetail(id);
  const d = q.data;
  const comments = useMealComments((d?.meals ?? []).map((m) => m.id));
  const setTargets = useSetClientTargets();
  const [kcal, setKcal] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), [today]);
  if (q.isLoading) {
    return (
      <Screen className="gap-4">
        <Skeleton height={40} width={200} />
        <Skeleton height={200} radius={20} />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen className="gap-4">
        <Text variant="title">{t('coach.noAccess')}</Text>
        <Button label={t('common.back')} onPress={() => router.replace(COACH_HOME)} />
      </Screen>
    );
  }

  const kcalTarget = d.goals?.kcal ?? d.profile.kcal_target ?? 2000;
  const proteinTarget = d.goals?.protein_g ?? d.profile.protein_target ?? 100;
  const byDay = intakeByDay(d.meals);
  const todayIntake = byDay.get(today);
  const planWeekdays = [...new Set(d.plans.flatMap((p) => p.plan_weekdays ?? []))];
  const doneThisWeek = d.workouts.filter((w) => istDay(new Date(w.started_at)) >= weekStart(today)).length;
  const plannedWeek = plannedSoFar(planWeekdays, addDays(weekStart(today), 6));
  const steps = d.activity.length ? Math.round(d.activity.reduce((a, x) => a + x.steps, 0) / d.activity.length) : null;
  const commentCount = (mealId: string) => (comments.data ?? []).filter((c) => c.meal_id === mealId).length;
  const proteinDays = days.filter((x) => (byDay.get(x)?.protein_g ?? 0) >= proteinTarget * 0.9).length;

  const saveTargets = () => {
    const n = (s: string | null, cur: number | null) =>
      s === null ? cur : s.trim() === '' ? null : Math.round(Number(s));
    const nk = n(kcal, d.goals?.kcal ?? null);
    const np = n(protein, d.goals?.protein_g ?? null);
    if ((nk != null && (nk < 800 || nk > 6000)) || (np != null && (np < 20 || np > 400))) {
      toast({ message: t('coach.targetsRange'), tone: 'error' });
      return;
    }
    setTargets.mutate(
      { clientId: d.profile.id, kcal: nk, protein_g: np },
      {
        onSuccess: () => {
          setKcal(null);
          setProtein(null);
          void q.refetch();
          toast({ message: t('coach.targetsSaved'), tone: 'success' });
        },
        onError: () => toast({ message: t('common.error'), tone: 'error' }),
      },
    );
  };

  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace(COACH_HOME))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      <View>
        <Text variant="display" accessibilityRole="header">
          {d.profile.name ?? t('coach.client')}
        </Text>
        <Text variant="caption">
          {[
            d.profile.goal ? t(`goal.${d.profile.goal}` as MessageKey) : null,
            d.profile.diet_type ? t(`diet.${d.profile.diet_type}` as MessageKey) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <Card className="gap-2">
        <Text variant="heading">{t('coach.today')}</Text>
        <Text variant="body">
          {t('coach.todayLine', {
            kcal: Math.round(todayIntake?.kcal ?? 0),
            kt: kcalTarget,
            p: Math.round(todayIntake?.protein_g ?? 0),
            pt: proteinTarget,
          })}
        </Text>
        <WeekBars
          days={days.map((x) => ({ label: weekday(x), value: byDay.get(x)?.kcal ?? 0 }))}
          target={kcalTarget}
          height={120}
          accessibilityLabel={t('coach.weekKcal')}
        />
        <Text variant="caption">
          {t('coach.adherence', { n: adherentDays(byDay, days, kcalTarget), p: proteinDays })}
        </Text>
      </Card>

      <Card className="gap-3">
        <Text variant="heading">{t('coach.targets')}</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label={t('goals.kcal')}
              value={kcal ?? (d.goals?.kcal == null ? '' : String(d.goals.kcal))}
              placeholder={String(d.profile.kcal_target ?? '')}
              onChangeText={setKcal}
              inputMode="numeric"
              keyboardType="number-pad"
              suffix="kcal"
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t('goals.protein')}
              value={protein ?? (d.goals?.protein_g == null ? '' : String(d.goals.protein_g))}
              placeholder={String(d.profile.protein_target ?? '')}
              onChangeText={setProtein}
              inputMode="numeric"
              keyboardType="number-pad"
              suffix="g"
            />
          </View>
        </View>
        <Button
          label={t('coach.setTargets')}
          variant="secondary"
          size="md"
          disabled={kcal === null && protein === null}
          loading={setTargets.isPending}
          onPress={saveTargets}
        />
      </Card>

      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text variant="heading">{t('coach.training')}</Text>
          <Text variant="label">{t('coach.sessions', { done: doneThisWeek, planned: plannedWeek })}</Text>
        </View>
        {d.plans.map((p) => (
          <Text key={p.id} variant="caption">
            {p.name} ·{' '}
            {(p.plan_weekdays ?? [])
              .map((w) =>
                new Date(Date.UTC(2026, 9, 18 + w)).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
              )
              .join(', ') || t('coach.unscheduled')}
          </Text>
        ))}
        <Button
          label={t('coach.assignPlan')}
          variant="secondary"
          size="md"
          onPress={() => router.push({ pathname: '/coach/plans', params: { client: d.profile.id } })}
        />
        {d.workouts.slice(0, 4).map((w) => (
          <Text key={w.id} variant="caption">
            {new Date(w.started_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
            {w.name ?? t('train.emptyName')} · {formatDuration(w.duration_s ?? 0)} ·{' '}
            {Math.round(w.volume_kg ?? 0).toLocaleString('en-IN')} kg
          </Text>
        ))}
        {d.prs.length ? (
          <View className="gap-1">
            {d.prs.slice(0, 5).map((p, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <Trophy color={colors.accent} size={14} />
                <Text variant="caption" className="flex-1">
                  {p.exercises?.name ?? t('train.exercise')} ·{' '}
                  {p.kind === 'reps' ? `${p.reps} × ${p.kg} kg` : `${Math.round(Number(p.value) * 10) / 10} kg`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card className="gap-2">
        <Text variant="heading">{t('coach.lifestyle')}</Text>
        <Text variant="caption">
          {steps == null ? t('coach.noSteps') : t('coach.stepsAvg', { n: steps.toLocaleString('en-IN') })}
        </Text>
        {d.habits.map((h) => {
          const logs = h.habit_logs.map((l) => ({ logged_at: l.logged_at, value: Number(l.value) }));
          const streak =
            h.kind === 'smoking'
              ? smokeFreeDays(logs, h.created_at, today)
              : habitStreak(h.kind, logs, h.daily_target == null ? null : Number(h.daily_target), h.created_at, today);
          const sleep = h.kind === 'sleep' ? recentAverage(logs, today) : null;
          return (
            <Text key={h.id} variant="caption">
              {h.name}:{' '}
              {h.kind === 'smoking' ? t('habits.smokeFree', { n: streak }) : t('habits.streak', { n: streak })}
              {sleep != null ? ` · ${t('habits.avg7', { v: sleep })}` : ''}
            </Text>
          );
        })}
        {d.weights.length >= 2 ? (
          <LineChart
            points={d.weights.map((w) => ({
              label: new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
              value: w.weight_kg,
            }))}
            unit=" kg"
            accessibilityLabel={t('body.weightTrend')}
          />
        ) : null}
      </Card>

      <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
        {t('coach.meals')}
      </Text>
      {!d.meals.length ? (
        <Card>
          <Text variant="body" className="text-ink-muted">
            {t('coach.noMeals')}
          </Text>
        </Card>
      ) : (
        d.meals.slice(0, 40).map((m) => (
          <PressableScale
            key={m.id}
            onPress={() => router.push({ pathname: '/coach/meal/[id]', params: { id: m.id } })}
            accessibilityLabel={m.meal_items.map((i) => i.dish).join(', ')}
            className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
          >
            <View className="w-20">
              <Text variant="label">
                {new Date(m.eaten_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}
              </Text>
              <Text variant="caption">{t(`meal.${m.meal_type}` as MessageKey)}</Text>
            </View>
            <View className="flex-1">
              <Text variant="body" numberOfLines={2}>
                {m.meal_items.map((i) => i.dish).join(', ')}
              </Text>
              <Text variant="caption">
                {Math.round(m.kcal)} kcal · {Math.round(m.protein_g)} g protein
              </Text>
            </View>
            {commentCount(m.id) ? (
              <View className="flex-row items-center gap-1">
                <MessageSquare color={colors.inkMuted} size={16} />
                <Text variant="caption">{commentCount(m.id)}</Text>
              </View>
            ) : (
              <ChevronRight color={colors.inkMuted} size={18} />
            )}
          </PressableScale>
        ))
      )}
      <Text variant="caption">{t('coach.medical')}</Text>
    </Screen>
  );
}
