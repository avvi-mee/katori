import { Share2 } from '@/components/icons';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ReportCard } from '@/components/ReportCard';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { StreakDots } from '@/components/StreakDots';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { WeekBars } from '@/components/WeekBars';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { useDayTotals } from '@/features/meals/api';
import { kcalText } from '@/features/meals/format';
import { lastNDays, proteinStreak, weekSummary } from '@/features/meals/streaks';
import { weeklyLine } from '@/features/personas/templates';
import { shareCard } from '@/features/share/shareCard';
import { istDay } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';

const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' });
const short = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function Progress() {
  useLocale();
  const { colors } = useTheme();
  const today = istDay();
  const { data: profile } = useProfile();
  // 60 days so the streak can run past one week.
  const totals = useDayTotals(today, 60);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const days = lastNDays(today, 7);
  const target = profile?.kcal_target ?? 2000;
  const proteinTarget = profile?.protein_target ?? 100;
  const byDay = totals.data ?? new Map();
  const week = weekSummary(byDay, days, proteinTarget);
  const streak = proteinStreak(byDay, today, proteinTarget);
  const coachLine = weeklyLine(profile?.persona ?? 'hype_friend', week.hitDays, week.loggedDays);

  const share = async () => {
    setSharing(true);
    try {
      const how = await shareCard(cardRef, `katori-week-${today}.png`, coachLine);
      if (how === 'downloaded') toast({ message: t('progress.shared'), tone: 'success' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ message: t('err.generic'), tone: 'error' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen className="gap-4">
      <Text variant="display" accessibilityRole="header">
        {t('tabs.progress')}
      </Text>

      <Card className="gap-3">
        <View className="flex-row items-baseline justify-between">
          <Text variant="heading">{t('progress.week')}</Text>
          {week.loggedDays ? (
            <Text variant="caption">{t('progress.avg', { kcal: kcalText(week.avgKcal) })}</Text>
          ) : null}
        </View>
        {totals.isPending ? (
          <Skeleton height={160} />
        ) : (
          <WeekBars
            days={days.map((d) => ({ label: weekday(d), value: byDay.get(d)?.kcal ?? 0 }))}
            target={target}
            accessibilityLabel={days.map((d) => `${short(d)}: ${Math.round(byDay.get(d)?.kcal ?? 0)} kcal`).join(', ')}
          />
        )}
      </Card>

      <Card className="gap-3">
        {streak ? (
          <Text variant="number" style={{ color: colors.protein }}>
            {t('progress.streak', { n: streak })}
          </Text>
        ) : (
          <Text variant="heading">{t('progress.noStreak')}</Text>
        )}
        <StreakDots days={week.proteinDays} label={t('report.proteinDays')} />
      </Card>

      <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
        {t('progress.reportTitle')}
      </Text>
      <View className="items-center">
        <ReportCard
          ref={cardRef}
          weekLabel={`${short(days[0]!)}–${short(today)}`}
          avgKcal={week.avgKcal}
          kcalTarget={target}
          proteinDays={week.proteinDays}
          persona={profile?.persona ?? 'hype_friend'}
          coachLine={coachLine}
        />
      </View>
      <Button
        label={t('progress.share')}
        variant="secondary"
        icon={<Share2 color={colors.ink} size={18} />}
        onPress={share}
        loading={sharing}
      />
    </Screen>
  );
}
