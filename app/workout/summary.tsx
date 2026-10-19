import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachBubble } from '@/components/CoachBubble';
import { Confetti } from '@/components/Confetti';
import { Trophy, TrendingUp } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { workoutLine } from '@/features/personas/trainLines';
import { historyFor, useExerciseMap, useTemplates, useWorkouts } from '@/features/workouts/api';
import { fmtKg, titleCase } from '@/features/workouts/format';
import {
  bestE1rm,
  deloadHint,
  detectPrs,
  formatDuration,
  musclesHit,
  progressionHint,
  type PrHit,
} from '@/features/workouts/math';
import { t, useLocale } from '@/lib/i18n';
import { upsertRows } from '@/lib/localRows';

const PR_LABEL: Record<PrHit['kind'], (p: PrHit) => string> = {
  weight: (p) => t('train.pr.weight', { kg: fmtKg(p.value), reps: p.reps ?? 0 }),
  reps: (p) => t('train.pr.reps', { reps: p.value, kg: fmtKg(p.kg ?? 0) }),
  e1rm: (p) => t('train.pr.e1rm', { kg: fmtKg(Math.round(p.value * 10) / 10) }),
  volume: (p) => t('train.pr.volume', { kg: Math.round(p.value).toLocaleString('en-IN') }),
};

export default function WorkoutSummary() {
  useLocale();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const uid = useSession((s) => s.session?.user.id);
  const { data: profile } = useProfile();
  const { data: workouts, isLoading } = useWorkouts();
  const exercises = useExerciseMap();
  const { data: templates } = useTemplates();
  const [savedTemplate, setSavedTemplate] = useState(false);
  const w = workouts?.find((x) => x.id === id);

  const analysis = useMemo(() => {
    if (!w || !workouts) return null;
    const earlier = workouts.filter((x) => x.started_at < w.started_at);
    const ids = [...new Set(w.sets.map((s) => s.exercise_id))];
    const prs = ids.flatMap((ex) =>
      detectPrs(
        historyFor(earlier, ex),
        w.sets.filter((s) => s.exercise_id === ex),
      ),
    );
    const perExercise = ids.map((ex) => {
      const info = exercises.get(ex);
      const sets = w.sets.filter((s) => s.exercise_id === ex);
      // Rep range from the template it came from; else 8–12.
      const repMax =
        templates?.find((x) => x.id === w.template_id)?.exercises.find((e) => e.exercise_id === ex)?.rep_max ?? 12;
      const sessions = [...earlier]
        .reverse()
        .map((x) => bestE1rm(x.sets.filter((s) => s.exercise_id === ex)))
        .filter((v) => v > 0);
      return {
        ex,
        info,
        sets,
        hint: progressionHint(sets, repMax, info?.primary_muscles ?? []),
        deload: deloadHint([...sessions, bestE1rm(sets)]),
      };
    });
    const muscles = musclesHit(
      perExercise.map((p) => ({ primary_muscles: p.info?.primary_muscles ?? [], sets: p.sets })),
    );
    return { prs, perExercise, muscles };
  }, [w, workouts, exercises, templates]);

  if (isLoading || !w || !analysis) {
    return (
      <Screen className="gap-4">
        {isLoading || !workouts ? (
          <>
            <Skeleton height={40} width={200} />
            <Skeleton height={140} radius={20} />
            <Skeleton height={200} radius={20} />
          </>
        ) : (
          <>
            <Text variant="title">{t('train.notFound')}</Text>
            <Button label={t('common.back')} onPress={() => router.replace('/(tabs)/train')} />
          </>
        )}
      </Screen>
    );
  }

  const minutes = Math.round((w.duration_s ?? 0) / 60);
  const line =
    profile &&
    workoutLine(profile, {
      prs: analysis.prs.filter((p) => p.kind !== 'volume').length,
      minutes,
      volume: w.volume_kg ?? 0,
    });

  const saveTemplate = async () => {
    const templateId = crypto.randomUUID();
    const order = [...new Set(w.sets.map((s) => s.exercise_id))];
    await upsertRows(qc, 'workout_templates', [
      {
        id: templateId,
        owner_id: uid!,
        name: w.name ?? t('train.emptyName'),
        split: 'custom',
        notes: null,
        position: 100,
      },
    ]);
    await upsertRows(
      qc,
      'template_exercises',
      order.map((ex, position) => {
        const working = w.sets.filter((s) => s.exercise_id === ex && s.kind !== 'warmup');
        const reps = working.map((s) => s.reps ?? 0).filter(Boolean);
        return {
          template_id: templateId,
          position,
          exercise_id: ex,
          sets: Math.max(1, Math.min(20, working.length)),
          rep_min: Math.max(1, Math.min(...(reps.length ? reps : [8]))),
          rep_max: Math.max(1, Math.max(...(reps.length ? reps : [12]))),
          rest_s: 90,
        };
      }),
    );
    setSavedTemplate(true);
    toast({ message: t('train.templateSaved'), tone: 'success' });
  };

  return (
    <View className="flex-1 bg-bg">
      <Screen className="gap-4">
        <View>
          <Text variant="caption">
            {new Date(w.started_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="display" accessibilityRole="header">
            {fresh ? t('train.niceWork') : (w.name ?? t('train.emptyName'))}
          </Text>
        </View>

        <Card className="flex-row flex-wrap gap-y-4" enterIndex={0}>
          {[
            { label: t('train.duration'), value: formatDuration(w.duration_s ?? 0) },
            { label: t('train.volume'), value: `${Math.round(w.volume_kg ?? 0).toLocaleString('en-IN')} kg` },
            { label: t('train.sets'), value: String(w.sets.length) },
            {
              label: t('train.burned'),
              value: w.kcal_low != null ? `${w.kcal_low}–${w.kcal_high}` : '–',
            },
          ].map((s) => (
            <View key={s.label} className="w-1/2 gap-0.5">
              <Text variant="caption">{s.label}</Text>
              <Text variant="number">{s.value}</Text>
            </View>
          ))}
          <Text variant="caption" className="w-full">
            {t('train.burnNote')}
          </Text>
        </Card>

        {line ? <CoachBubble persona={profile!.persona} text={line} /> : null}

        {analysis.prs.length ? (
          <Card className="gap-3" enterIndex={1}>
            <View className="flex-row items-center gap-2">
              <Trophy color={colors.accent} size={22} />
              <Text variant="heading">{t('train.newPrs', { n: analysis.prs.length })}</Text>
            </View>
            {analysis.prs.map((p) => (
              <View key={`${p.exercise_id}-${p.kind}`} className="flex-row justify-between gap-3">
                <Text variant="body" className="flex-1" numberOfLines={1}>
                  {exercises.get(p.exercise_id)?.name ?? t('train.exercise')}
                </Text>
                <Text variant="label">{PR_LABEL[p.kind](p)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {analysis.muscles.length ? (
          <Card className="gap-2" enterIndex={2}>
            <Text variant="heading">{t('train.musclesHit')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {analysis.muscles.map((m) => (
                <View key={m} className="rounded-full bg-surface-2 px-3 py-1.5">
                  <Text variant="label">{titleCase(m)}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card className="gap-3" enterIndex={3}>
          {analysis.perExercise.map((p) => (
            <View key={p.ex} className="gap-1">
              <Text variant="label">{p.info?.name ?? t('train.exercise')}</Text>
              <Text variant="caption">
                {p.sets
                  .map((s) =>
                    s.kg != null && s.reps != null
                      ? `${fmtKg(s.kg)}×${s.reps}${s.kind === 'warmup' ? 'w' : ''}`
                      : s.distance_m
                        ? `${(s.distance_m / 1000).toFixed(1)} km`
                        : `${Math.round((s.duration_s ?? 0) / 60)} min`,
                  )
                  .join(', ')}
              </Text>
              {p.hint ? (
                <View className="flex-row items-center gap-1">
                  <TrendingUp color={colors.protein} size={14} />
                  <Text variant="caption" className="text-ink">
                    {t('train.nextTime', { kg: fmtKg(p.hint.nextKg) })}
                  </Text>
                </View>
              ) : null}
              {p.deload ? (
                <Text variant="caption" className="text-ink">
                  {t('train.deload')}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>

        {!w.template_id && !savedTemplate ? (
          <Button label={t('train.saveTemplate')} variant="secondary" onPress={saveTemplate} />
        ) : null}
        <Button label={t('train.done')} onPress={() => router.replace('/(tabs)/train')} />
      </Screen>
      {fresh && analysis.prs.length ? <Confetti /> : null}
    </View>
  );
}
