import type { Ref } from 'react';
import { View } from 'react-native';

import { personaMeta, type PersonaId } from '@/features/personas/personas';
import { t } from '@/lib/i18n';

import { StreakDots } from './StreakDots';
import { Text } from './Text';

type Props = {
  weekLabel: string;
  avgKcal: number;
  kcalTarget: number;
  proteinDays: boolean[];
  coachLine: string;
  persona: PersonaId;
  ref?: Ref<View>;
};

/** Weekly story-sized card in the coach's voice; captured to PNG for sharing. */
export function ReportCard({ weekLabel, avgKcal, kcalTarget, proteinDays, coachLine, persona, ref }: Props) {
  const hit = proteinDays.filter(Boolean).length;
  return (
    <View
      ref={ref}
      collapsable={false}
      className="aspect-[9/14] w-full max-w-[360px] justify-between rounded-sheet bg-accent p-6"
    >
      <View>
        <Text variant="caption" className="font-sans-bold uppercase tracking-widest text-on-accent">
          Katori · {weekLabel}
        </Text>
        <Text variant="display" className="mt-1 text-on-accent">
          {t('report.title')}
        </Text>
      </View>
      <View className="gap-5">
        <View>
          <Text variant="hero" className="text-on-accent">
            {Math.round(avgKcal)}
          </Text>
          <Text variant="label" className="mt-2 text-on-accent">
            {t('report.avgKcal')} · target {Math.round(kcalTarget)}
          </Text>
        </View>
        <View className="gap-2">
          <Text variant="number" className="text-on-accent">
            {hit}/7
          </Text>
          <Text variant="label" className="text-on-accent">
            {t('report.proteinDays')}
          </Text>
          <View className="self-start rounded-full bg-surface px-3 py-2">
            <StreakDots days={proteinDays} label={t('report.proteinDays')} />
          </View>
        </View>
      </View>
      <View className="rounded-card bg-surface p-4">
        <Text variant="caption">{personaMeta[persona].name}</Text>
        <Text variant="body">“{coachLine}”</Text>
      </View>
    </View>
  );
}
