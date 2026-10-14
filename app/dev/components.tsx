import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { CoachBubble } from '@/components/CoachBubble';
import { EmptyState } from '@/components/EmptyState';
import { MacroBar } from '@/components/MacroBar';
import { PortionSheet } from '@/components/PortionSheet';
import { RangeBadge } from '@/components/RangeBadge';
import { ReportCard } from '@/components/ReportCard';
import { Ring } from '@/components/Ring';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { StreakDots } from '@/components/StreakDots';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme, useThemePref } from '@/design/theme';
import { getLocale, setLocale, t } from '@/lib/i18n';
import type { Question } from '@/types/meal';

const sampleQuestions: Question[] = [
  {
    id: 'q1',
    item_key: 'dal',
    kind: 'portion',
    prompt: 'Dal kitni thi?',
    options: [
      { id: 'half', label: '½ katori', value: 0.5 },
      { id: 'one', label: '1', value: 1 },
      { id: 'one_half', label: '1½', value: 1.5 },
      { id: 'two', label: '2', value: 2 },
    ],
    default_option: 'one',
  },
  {
    id: 'q2',
    item_key: 'roti',
    kind: 'count',
    prompt: 'Kitni roti?',
    options: ['1', '2', '3', '4+'].map((l, i) => ({ id: `c${i + 1}`, label: l, value: i + 1 })),
    default_option: 'c2',
  },
  {
    id: 'q3',
    item_key: 'sabzi',
    kind: 'oil',
    prompt: 'Sabzi mein tel?',
    options: [
      { id: 'kam', label: 'Kam', value: 0.5 },
      { id: 'normal', label: 'Normal', value: 1 },
      { id: 'zyada', label: 'Zyada', value: 1.8 },
    ],
    default_option: 'normal',
  },
];

export default function ComponentGallery() {
  const { colors } = useTheme();
  const { pref, setPref } = useThemePref();
  const [, rerender] = useState(0);
  const [kcal, setKcal] = useState(1240);
  const [chip, setChip] = useState('one');
  const [sheet, setSheet] = useState(false);
  const [portion, setPortion] = useState(false);
  const [loading, setLoading] = useState(false);

  // Dev-only screen: hidden from production builds unless explicitly enabled.
  if (!__DEV__ && process.env.EXPO_PUBLIC_SHOW_DEV !== '1') return <Redirect href="/" />;

  return (
    <Screen>
      <Text variant="display" accessibilityRole="header" className="mb-1">
        Components
      </Text>
      <Text variant="caption" className="mb-4">
        Design system gallery · tokens, motion, a11y
      </Text>

      <Section title="Theme & language">
        <ChipRow
          accessibilityLabel="Theme"
          options={[
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
          value={pref}
          onChange={(id) => setPref(id as typeof pref)}
        />
        <ChipRow
          accessibilityLabel="Language"
          options={[
            { id: 'en', label: 'English' },
            { id: 'hinglish', label: 'Hinglish' },
          ]}
          value={getLocale()}
          onChange={(id) => {
            setLocale(id as 'en' | 'hinglish');
            rerender((n) => n + 1);
          }}
        />
      </Section>

      <Section title="Type">
        <Text variant="hero">1,840</Text>
        <Text variant="display">Display Fraunces</Text>
        <Text variant="title">Title Fraunces</Text>
        <Text variant="heading">Heading Manrope</Text>
        <Text variant="body">Body text for longer copy. Aaj protein thoda kam hai.</Text>
        <Text variant="caption">Caption muted text</Text>
      </Section>

      <Section title="Buttons">
        <Button label="Primary action" onPress={() => toast({ message: 'Primary pressed' })} />
        <Button label="Secondary" variant="secondary" onPress={() => {}} />
        <Button label="Ghost" variant="ghost" onPress={() => {}} />
        <Button label="Delete account" variant="danger" onPress={() => {}} />
        <Button
          label="Tap to load"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }}
        />
        <Button label="Disabled" disabled />
      </Section>

      <Section title="Ring + RangeBadge">
        <View className="items-center gap-3">
          <Ring progress={kcal / 2000} accessibilityLabel={`${kcal} of 2000 kcal`}>
            <Text variant="hero">{kcal}</Text>
            <Text variant="caption">of 2000 kcal</Text>
          </Ring>
          <RangeBadge low={kcal - 60} high={kcal + 60} />
          <View className="flex-row gap-2">
            <Button size="md" variant="secondary" label="− 300" onPress={() => setKcal((k) => Math.max(0, k - 300))} />
            <Button size="md" variant="secondary" label="+ 300" onPress={() => setKcal((k) => k + 300)} />
          </View>
        </View>
      </Section>

      <Section title="MacroBar">
        <MacroBar label={t('macro.protein')} value={62} target={120} color={colors.protein} index={0} />
        <MacroBar label={t('macro.carbs')} value={180} target={220} color={colors.carbs} index={1} />
        <MacroBar label={t('macro.fat')} value={48} target={60} color={colors.fat} index={2} />
      </Section>

      <Section title="ChipRow">
        <ChipRow accessibilityLabel="Portion" options={sampleQuestions[0]!.options} value={chip} onChange={setChip} />
      </Section>

      <Section title="CoachBubble">
        <CoachBubble persona="gym_bro" text="Bhai 3 samose?? Protein 40g short hai aaj. Dinner mein paneer bhurji." />
        <CoachBubble
          persona="desi_mummy"
          gentle
          text="Beta, aaj bahut kam khaya hai. Ek proper meal kha lo, dal-chawal bhi chalega."
        />
      </Section>

      <Section title="Sheets">
        <Button label="Open Sheet" variant="secondary" onPress={() => setSheet(true)} />
        <Button label="Open PortionSheet" onPress={() => setPortion(true)} />
      </Section>

      <Section title="Skeleton">
        <Card className="gap-3">
          <Skeleton width="60%" height={22} />
          <Skeleton height={14} />
          <Skeleton width="80%" height={14} />
          <View className="flex-row gap-3">
            <Skeleton width={64} height={64} radius={32} />
            <View className="flex-1 justify-center gap-2">
              <Skeleton height={12} />
              <Skeleton width="50%" height={12} />
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Toast">
        <Button
          label="Meal deleted (with undo)"
          variant="secondary"
          onPress={() =>
            toast({
              message: 'Meal deleted',
              action: { label: t('common.undo'), onPress: () => toast({ message: 'Restored', tone: 'success' }) },
            })
          }
        />
        <Button
          label="Error toast"
          variant="secondary"
          onPress={() => toast({ message: 'Network gaya. Will retry.', tone: 'error' })}
        />
      </Section>

      <Section title="StreakDots">
        <StreakDots label="Protein streak" days={[true, true, false, true, true, true, false]} />
      </Section>

      <Section title="ReportCard">
        <View className="items-center">
          <ReportCard
            weekLabel="Oct 6–12"
            avgKcal={1925}
            kcalTarget={2000}
            proteinDays={[true, true, false, true, true, true, false]}
            persona="hype_friend"
            coachLine="5 protein days! One more and you're unstoppable."
          />
        </View>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            title={t('empty.meals.title')}
            body={t('empty.meals.body')}
            action={{ label: t('empty.meals.action'), onPress: () => toast({ message: 'Scan coming in step 4' }) }}
          />
        </Card>
      </Section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Edit meal">
        <Text variant="body" className="mb-4">
          Drag the handle down, tap outside, or press Escape to close.
        </Text>
        <Button label={t('common.close')} variant="secondary" onPress={() => setSheet(false)} />
      </Sheet>
      <PortionSheet
        open={portion}
        onClose={() => setPortion(false)}
        questions={sampleQuestions}
        onConfirm={(answers) => {
          setPortion(false);
          toast({ message: `Saved ${answers.length} answers`, tone: 'success' });
        }}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-8 gap-3">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {title}
      </Text>
      {children}
    </View>
  );
}
