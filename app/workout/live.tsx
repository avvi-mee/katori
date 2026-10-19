import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChevronLeft, Plus } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { useWeights } from '@/features/body/api';
import { lastSession, useExerciseMap, useWorkouts } from '@/features/workouts/api';
import { ExerciseBlock } from '@/features/workouts/ExerciseBlock';
import { formatDuration } from '@/features/workouts/math';
import { RestTimer } from '@/features/workouts/RestTimer';
import { finishRows, useLiveWorkout } from '@/features/workouts/session';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';
import { upsertRows } from '@/lib/localRows';
import { useNow } from '@/lib/useNow';

export default function LiveWorkout() {
  useLocale();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const live = useLiveWorkout((s) => s.live);
  const rest = useLiveWorkout((s) => s.rest);
  const uid = useSession((s) => s.session?.user.id);
  const { data: profile } = useProfile();
  const { data: weights } = useWeights();
  const exercises = useExerciseMap();
  const { data: workouts } = useWorkouts();
  const now = useNow();
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);

  if (!live) return <Redirect href="/(tabs)/train" />;

  const allSets = live.exercises.flatMap((e) => e.sets);
  const done = allSets.filter((s) => s.done_at).length;
  const groups = [...new Set(live.exercises.map((e) => e.superset_group).filter((g) => g != null))];

  const finish = async () => {
    const bodyKg = weights?.at(-1)?.weight_kg ?? profile?.weight_kg ?? null;
    const rows = uid ? finishRows(live, uid, bodyKg) : null;
    if (!rows) {
      toast({ message: t('train.nothingDone'), tone: 'error' });
      setConfirm(null);
      return;
    }
    setSaving(true);
    try {
      // Durable on the device before we leave the screen; the outbox syncs it (sets after their workout).
      await upsertRows(qc, 'workouts', [rows.workout]);
      await upsertRows(qc, 'workout_sets', rows.sets);
      track('workout_finished', { sets: rows.sets.length, duration_s: rows.workout.duration_s });
      useLiveWorkout.getState().discard();
      router.replace({ pathname: '/workout/summary', params: { id: rows.workout.id, fresh: '1' } });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="border-b border-line bg-surface px-2" style={{ paddingTop: insets.top + 4 }}>
        <View className="mx-auto w-full max-w-[560px] flex-row items-center gap-1 pb-2">
          <PressableScale
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'))}
            accessibilityLabel={t('common.back')}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <ChevronLeft color={colors.ink} size={24} />
          </PressableScale>
          <View className="flex-1">
            <Text variant="heading" numberOfLines={1}>
              {live.name}
            </Text>
            <Text variant="caption">
              {formatDuration((now - Date.parse(live.started_at)) / 1000)} ·{' '}
              {t('train.setsDone', { n: done, total: allSets.length })}
            </Text>
          </View>
          <Button label={t('train.finish')} size="md" onPress={() => setConfirm('finish')} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + (rest ? 200 : 120) }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-[560px] gap-3 px-3 pt-3">
          {live.exercises.map((ex, i) => (
            <ExerciseBlock
              key={ex.key}
              ex={ex}
              info={exercises.get(ex.exercise_id)}
              last={workouts ? (lastSession(workouts, ex.exercise_id, live.id)?.sets ?? null) : null}
              group={ex.superset_group == null ? null : String.fromCharCode(65 + groups.indexOf(ex.superset_group))}
              isFirst={i === 0}
              isLast={i === live.exercises.length - 1}
            />
          ))}
          {!live.exercises.length ? (
            <Text variant="body" className="py-8 text-center text-ink-muted">
              {t('train.emptyHint')}
            </Text>
          ) : null}
          <Button
            label={t('train.addExercises')}
            variant="secondary"
            icon={<Plus color={colors.ink} size={18} />}
            onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'add' } })}
          />
          <Button label={t('train.discard')} variant="ghost" onPress={() => setConfirm('discard')} />
        </View>
      </ScrollView>

      <RestTimer />

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'discard' ? t('train.discardTitle') : t('train.finishTitle')}
      >
        <View className="gap-4">
          <Text variant="body" className="text-ink-muted">
            {confirm === 'discard'
              ? t('train.discardBody')
              : allSets.length > done
                ? t('train.finishIncomplete', { n: allSets.length - done })
                : t('train.finishBody')}
          </Text>
          {confirm === 'discard' ? (
            <Button
              label={t('train.discard')}
              variant="danger"
              onPress={() => {
                useLiveWorkout.getState().discard();
                setConfirm(null);
                router.replace('/(tabs)/train');
              }}
            />
          ) : (
            <Button label={t('train.finish')} loading={saving} onPress={finish} />
          )}
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirm(null)} />
        </View>
      </Sheet>
    </View>
  );
}
