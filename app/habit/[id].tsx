import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachBubble } from '@/components/CoachBubble';
import { ChevronLeft, Phone, Plus } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { WeekBars } from '@/components/WeekBars';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { HABIT_PRESETS, QUITLINE, TRIGGERS, useHabitActions, useHabitLogs, useHabits } from '@/features/habits/api';
import {
  cigarettesAvoided,
  habitStreak,
  isLimitHabit,
  moneySaved,
  perDay,
  recentAverage,
  smokeFreeDays,
} from '@/features/habits/math';
import { formatHabitValue, HABIT_ICON, SmokeLogSheet } from '@/features/habits/ui';
import { smokingLine } from '@/features/personas/trainLines';
import { track } from '@/lib/analytics';
import { addDays, istDay } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';

export default function HabitDetail() {
  useLocale();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = istDay();
  const { data: profile } = useProfile();
  const { data: habits, isLoading } = useHabits();
  const { data: allLogs } = useHabitLogs();
  const actions = useHabitActions();
  const [smokeOpen, setSmokeOpen] = useState(false);
  const h = habits?.find((x) => x.id === id);
  const logs = useMemo(() => (allLogs ?? []).filter((l) => l.habit_id === id), [allLogs, id]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);

  if (!h) {
    return (
      <Screen className="gap-4">
        {isLoading ? <Skeleton height={200} radius={20} /> : <Text variant="title">{t('habits.notFound')}</Text>}
      </Screen>
    );
  }

  const Icon = HABIT_ICON[h.kind];
  const days = perDay(logs);
  const todayValue = days.get(today) ?? 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({
    label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' }),
    value: days.get(d) ?? 0,
  }));
  const todayLogs = logs.filter((l) => istDay(new Date(l.logged_at)) === today);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <Screen className="gap-4">
      <View className="flex-row items-center gap-2">
        <PressableScale
          onPress={back}
          accessibilityLabel={t('common.back')}
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </PressableScale>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
          <Icon color={colors.ink} size={20} />
        </View>
        <Text variant="title" className="flex-1" accessibilityRole="header">
          {h.name}
        </Text>
      </View>

      {h.kind === 'smoking' ? (
        <SmokingView
          habitCreated={h.created_at}
          baseline={h.baseline_per_day}
          price={h.price_per_unit}
          logs={logs}
          today={today}
          todayValue={todayValue}
          persona={profile?.persona ?? 'hype_friend'}
          onLog={() => setSmokeOpen(true)}
        />
      ) : (
        <Card className="items-center gap-3 py-6" enterIndex={0}>
          <Text variant="caption">{t('habits.today')}</Text>
          <Text variant="hero">{formatHabitValue(h, todayValue)}</Text>
          {h.daily_target != null ? (
            <Text variant="label">
              {isLimitHabit(h.kind)
                ? t('habits.limitIs', { v: formatHabitValue(h, h.daily_target) })
                : t('habits.targetIs', { v: formatHabitValue(h, h.daily_target) })}
            </Text>
          ) : null}
          <View className="flex-row gap-3">
            <Button
              label={t('habits.undo')}
              variant="secondary"
              size="md"
              disabled={!todayLogs.length}
              onPress={() => actions.removeLog(todayLogs.at(-1)!.id)}
            />
            <Button
              label={`+ ${formatHabitValue(h, HABIT_PRESETS[h.kind].step)}`}
              size="md"
              icon={<Plus color={colors.onAccent} size={18} />}
              onPress={async () => {
                await actions.log(h.id, HABIT_PRESETS[h.kind].step);
                track('habit_logged', { kind: h.kind });
              }}
            />
          </View>
          <Text variant="caption">
            {t('habits.streak', { n: habitStreak(h.kind, logs, h.daily_target, h.created_at, today) })}
            {h.kind === 'sleep' && recentAverage(logs, today) != null
              ? ` · ${t('habits.avg7', { v: recentAverage(logs, today)! })}`
              : ''}
          </Text>
        </Card>
      )}

      <Card className="gap-2" enterIndex={1}>
        <Text variant="heading">{t('habits.last7')}</Text>
        <WeekBars
          days={week}
          target={h.daily_target ?? (h.kind === 'smoking' ? (h.baseline_per_day ?? 1) : 1)}
          overIsBad={isLimitHabit(h.kind)}
          height={120}
          accessibilityLabel={t('habits.last7')}
        />
      </Card>

      {h.kind === 'smoking' ? (
        <Card className="gap-3" enterIndex={2}>
          <Text variant="heading">{t('habits.settings')}</Text>
          <TextField
            label={t('habits.baseline')}
            value={baseline ?? (h.baseline_per_day == null ? '' : String(h.baseline_per_day))}
            onChangeText={setBaseline}
            inputMode="numeric"
            keyboardType="number-pad"
          />
          <TextField
            label={t('habits.price')}
            value={price ?? (h.price_per_unit == null ? '' : String(h.price_per_unit))}
            onChangeText={setPrice}
            inputMode="decimal"
            keyboardType="decimal-pad"
            suffix="₹"
          />
          <Button
            label={t('common.save')}
            variant="secondary"
            disabled={baseline === null && price === null}
            onPress={async () => {
              const n = (s: string | null, cur: number | null) =>
                s === null ? cur : s.trim() === '' ? null : Math.max(0, Number(s) || 0);
              await actions.update(h, {
                baseline_per_day: n(baseline, h.baseline_per_day),
                price_per_unit: n(price, h.price_per_unit),
              });
              setBaseline(null);
              setPrice(null);
              toast({ message: t('habits.saved'), tone: 'success' });
            }}
          />
        </Card>
      ) : null}

      <Button
        label={t('habits.archive')}
        variant="ghost"
        onPress={async () => {
          await actions.archive(h);
          back();
        }}
      />
      <SmokeLogSheet habit={h} open={smokeOpen} onClose={() => setSmokeOpen(false)} />
    </Screen>
  );
}

function SmokingView({
  habitCreated,
  baseline,
  price,
  logs,
  today,
  todayValue,
  persona,
  onLog,
}: {
  habitCreated: string;
  baseline: number | null;
  price: number | null;
  logs: { logged_at: string; value: number; trigger: string | null }[];
  today: string;
  todayValue: number;
  persona: Parameters<typeof smokingLine>[0];
  onLog: () => void;
}) {
  const free = smokeFreeDays(logs, habitCreated, today);
  const avoided = cigarettesAvoided(logs, baseline ?? 0, habitCreated, today);
  const saved = moneySaved(avoided, price);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const triggers = TRIGGERS.map((tr) => ({
    tr,
    n: logs.filter((l) => l.trigger === tr && l.logged_at >= monthAgo).reduce((a, l) => a + l.value, 0),
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return (
    <>
      <Card className="items-center gap-2 py-6" enterIndex={0}>
        <Text variant="caption">{t('habits.smokeFreeTitle')}</Text>
        <Text variant="hero">{free}</Text>
        <Text variant="label">{t('habits.days')}</Text>
        <View className="mt-2 w-full flex-row">
          <View className="flex-1 items-center">
            <Text variant="number">{avoided.toLocaleString('en-IN')}</Text>
            <Text variant="caption">{t('habits.avoided')}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text variant="number">₹{saved.toLocaleString('en-IN')}</Text>
            <Text variant="caption">{t('habits.saved')}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text variant="number">{todayValue}</Text>
            <Text variant="caption">{t('habits.todayCount')}</Text>
          </View>
        </View>
        {baseline == null ? <Text variant="caption">{t('habits.setBaseline')}</Text> : null}
      </Card>
      <CoachBubble
        persona={persona}
        gentle
        text={smokingLine(persona, { smokeFreeDays: free, today: todayValue, baseline, avoided, saved })}
      />
      <Button label={t('habits.logCigarette')} variant="secondary" onPress={onLog} />
      {triggers.length ? (
        <Card className="gap-2">
          <Text variant="heading">{t('habits.patterns')}</Text>
          {triggers.map(({ tr, n }) => (
            <View key={tr} className="flex-row justify-between">
              <Text variant="body">{t(`habits.trigger.${tr}`)}</Text>
              <Text variant="label">{n}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <PressableScale
        onPress={() => Linking.openURL(QUITLINE.tel)}
        accessibilityRole="link"
        accessibilityLabel={t('habits.quitline', { n: QUITLINE.label })}
        className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-protein">
          <Phone color="#fff" size={20} />
        </View>
        <View className="flex-1">
          <Text variant="heading">{t('habits.quitlineTitle')}</Text>
          <Text variant="caption">{t('habits.quitline', { n: QUITLINE.label })}</Text>
        </View>
      </PressableScale>
    </>
  );
}
