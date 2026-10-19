import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, ChevronRight, Plus } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { useTargets } from '@/features/goals/api';
import { HABIT_PRESETS, useHabitActions, useHabitLogs, useHabitsToday, type Habit } from '@/features/habits/api';
import { habitStreak, smokeFreeDays } from '@/features/habits/math';
import { AddHabitSheet, formatHabitValue, HABIT_ICON, SmokeLogSheet } from '@/features/habits/ui';
import { track } from '@/lib/analytics';
import { istDay } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';

export default function Habits() {
  useLocale();
  const { colors } = useTheme();
  const today = istDay();
  const rows = useHabitsToday(today);
  const { data: logs } = useHabitLogs();
  const targets = useTargets();
  const { log } = useHabitActions();
  const [adding, setAdding] = useState(false);
  const [smoking, setSmoking] = useState<Habit | null>(null);

  const streak = (h: Habit) => {
    const mine = (logs ?? []).filter((l) => l.habit_id === h.id);
    return h.kind === 'smoking'
      ? smokeFreeDays(mine, h.created_at, today)
      : habitStreak(h.kind, mine, h.daily_target, h.created_at, today);
  };

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
        <Text variant="display" className="flex-1" accessibilityRole="header">
          {t('habits.title')}
        </Text>
      </View>
      <Text variant="body" className="text-ink-muted">
        {t('habits.subtitle')}
      </Text>

      {!rows ? (
        <Skeleton height={80} radius={20} />
      ) : !rows.length ? (
        <Card className="items-center gap-3 py-8">
          <Text variant="title" className="text-center">
            {t('habits.emptyTitle')}
          </Text>
          <Text variant="body" className="text-center text-ink-muted">
            {t('habits.emptyBody')}
          </Text>
        </Card>
      ) : (
        rows.map(({ habit: h, value }, i) => {
          const Icon = HABIT_ICON[h.kind];
          const s = streak(h);
          return (
            <Card key={h.id} className="flex-row items-center gap-3" enterIndex={i}>
              <PressableScale
                onPress={() => router.push({ pathname: '/habits/[id]', params: { id: h.id } })}
                accessibilityLabel={t('habits.open', { name: h.name })}
                className="flex-1 flex-row items-center gap-3"
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-accent-soft">
                  <Icon color={colors.ink} size={22} />
                </View>
                <View className="flex-1">
                  <Text variant="heading">{h.name}</Text>
                  <Text variant="caption">
                    {formatHabitValue(h, value)}
                    {h.daily_target != null ? ` / ${formatHabitValue(h, h.daily_target)}` : ''} ·{' '}
                    {h.kind === 'smoking' ? t('habits.smokeFree', { n: s }) : t('habits.streak', { n: s })}
                  </Text>
                </View>
                <ChevronRight color={colors.inkMuted} size={20} />
              </PressableScale>
              <PressableScale
                onPress={async () => {
                  if (h.kind === 'smoking') return setSmoking(h);
                  await log(h.id, HABIT_PRESETS[h.kind].step);
                  track('habit_logged', { kind: h.kind });
                }}
                accessibilityLabel={t('habits.logOne', { name: h.name })}
                pressedScale={0.88}
                className="h-12 w-12 items-center justify-center rounded-full bg-accent"
              >
                <Plus color={colors.onAccent} size={24} strokeWidth={2.5} />
              </PressableScale>
            </Card>
          );
        })
      )}

      <Button
        label={t('habits.add')}
        variant="secondary"
        icon={<Plus color={colors.ink} size={18} />}
        onPress={() => setAdding(true)}
      />

      <AddHabitSheet
        open={adding}
        onClose={() => setAdding(false)}
        existing={(rows ?? []).map((r) => r.habit.kind)}
        defaults={{ water: targets.water_ml, sleep: targets.sleep_h }}
      />
      <SmokeLogSheet habit={smoking} open={!!smoking} onClose={() => setSmoking(null)} />
    </Screen>
  );
}
