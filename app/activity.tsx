import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, Footprints } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { SwipeRow } from '@/components/SwipeRow';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { WeekBars } from '@/components/WeekBars';
import { useTheme } from '@/design/theme';
import { stepsOn, useActivityActions, useActivityDays, useRuns } from '@/features/activity/api';
import { RunSheet, StepsSheet } from '@/features/activity/sheets';
import { useTargets } from '@/features/goals/api';
import { formatDuration, formatPace, paceSecPerKm } from '@/features/workouts/math';
import { track } from '@/lib/analytics';
import { addDays, istDay } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';

/** Steps (typed in from the phone's health app until Phase 4) and runs/walks/rides by distance + time. */
export default function ActivityScreen() {
  useLocale();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ run?: string; steps?: string }>();
  const today = istDay();
  const targets = useTargets();
  const days = useActivityDays();
  const runs = useRuns();
  const actions = useActivityActions();
  const [stepsOpen, setStepsOpen] = useState(params.steps === '1');
  const [runOpen, setRunOpen] = useState(params.run === '1');
  const steps = stepsOn(days.data, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({
    label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' }),
    value: stepsOn(days.data, d) ?? 0,
  }));

  return (
    <Screen className="gap-4">
      <View className="flex-row items-center gap-1">
        <PressableScale
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          accessibilityLabel={t('common.back')}
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </PressableScale>
        <Text variant="display" accessibilityRole="header">
          {t('activity.title')}
        </Text>
      </View>

      <Card className="gap-3" enterIndex={0}>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-accent-soft">
            <Footprints color={colors.ink} size={22} />
          </View>
          <View className="flex-1">
            <Text variant="caption">{t('activity.stepsToday')}</Text>
            {days.isLoading ? (
              <Skeleton height={28} width={120} />
            ) : (
              <Text variant="number">
                {(steps ?? 0).toLocaleString('en-IN')}{' '}
                <Text variant="caption">/ {targets.steps.toLocaleString('en-IN')}</Text>
              </Text>
            )}
          </View>
          <Button
            label={steps == null ? t('activity.addSteps') : t('activity.edit')}
            size="md"
            variant="secondary"
            onPress={() => setStepsOpen(true)}
          />
        </View>
        <WeekBars
          days={week}
          target={targets.steps}
          overIsBad={false}
          height={120}
          accessibilityLabel={t('activity.weekSteps')}
        />
        <Text variant="caption">{t('activity.stepsHint')}</Text>
      </Card>

      <View className="mt-2 flex-row items-center justify-between">
        <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
          {t('activity.runs')}
        </Text>
        <Button label={t('activity.logRun')} size="md" onPress={() => setRunOpen(true)} />
      </View>
      {runs.isLoading ? (
        <Skeleton height={72} radius={20} />
      ) : !runs.data?.length ? (
        <Card>
          <Text variant="body" className="text-ink-muted">
            {t('activity.noRuns')}
          </Text>
        </Card>
      ) : (
        <View className="gap-2">
          {[...runs.data]
            .sort((a, b) => b.started_at.localeCompare(a.started_at))
            .slice(0, 30)
            .map((r) => (
              <SwipeRow key={r.id} onDelete={() => actions.removeRun(r.id)} deleteLabel={t('today.delete')}>
                <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4">
                  <View className="flex-1">
                    <Text variant="heading">
                      {t(`activity.kind.${r.kind}`)} · {(r.distance_m / 1000).toFixed(2)} km
                    </Text>
                    <Text variant="caption">
                      {new Date(r.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ·{' '}
                      {formatDuration(r.duration_s)} · {formatPace(paceSecPerKm(r.distance_m, r.duration_s))}
                      {r.pending ? ` · ${t('sync.pending')}` : ''}
                    </Text>
                  </View>
                </View>
              </SwipeRow>
            ))}
        </View>
      )}

      <StepsSheet
        open={stepsOpen}
        initial={steps}
        onClose={() => setStepsOpen(false)}
        onSave={async (n) => {
          await actions.setSteps(today, n);
          setStepsOpen(false);
        }}
      />
      <RunSheet
        open={runOpen}
        onClose={() => setRunOpen(false)}
        onSave={async (r) => {
          await actions.logRun(r);
          track('run_logged', { kind: r.kind, distance_m: r.distance_m });
          setRunOpen(false);
          toast({ message: t('activity.runSaved'), tone: 'success' });
        }}
      />
    </Screen>
  );
}
