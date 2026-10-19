import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Candy, CigaretteOff, CircleCheck, Cookie, Droplet, Moon, Wine, type LucideIcon } from '@/components/icons';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';

import { HABIT_PRESETS, TRIGGERS, useHabitActions, type Habit, type Trigger } from './api';
import type { HabitKind } from './math';

export const HABIT_ICON: Record<HabitKind, LucideIcon> = {
  smoking: CigaretteOff,
  water: Droplet,
  sleep: Moon,
  alcohol: Wine,
  junk: Cookie,
  sugar: Candy,
  custom: CircleCheck,
};

export const KINDS: HabitKind[] = ['smoking', 'water', 'sleep', 'alcohol', 'junk', 'sugar', 'custom'];

export const formatHabitValue = (h: Pick<Habit, 'kind' | 'unit'>, v: number) =>
  h.kind === 'water' && v >= 1000
    ? `${(v / 1000).toFixed(v % 1000 ? 2 : 1)} L`
    : `${Math.round(v * 10) / 10} ${h.unit}`;

/** Logging a cigarette asks (optionally) what triggered it, for the patterns view. Never a judgement. */
export function SmokeLogSheet({ habit, open, onClose }: { habit: Habit | null; open: boolean; onClose: () => void }) {
  const { log } = useHabitActions();
  const [trigger, setTrigger] = useState<Trigger | 'none'>('none');
  useEffect(() => {
    if (open) setTrigger('none');
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('habits.logCigarette')}>
      <View className="gap-4">
        <Text variant="body" className="text-ink-muted">
          {t('habits.triggerAsk')}
        </Text>
        <ChipRow
          accessibilityLabel={t('habits.trigger')}
          options={[
            { id: 'none', label: t('habits.trigger.none') },
            ...TRIGGERS.map((x) => ({ id: x, label: t(`habits.trigger.${x}`) })),
          ]}
          value={trigger}
          onChange={(v) => setTrigger(v as Trigger | 'none')}
        />
        <Button
          label={t('habits.logIt')}
          onPress={async () => {
            if (habit) {
              await log(habit.id, 1, { trigger: trigger === 'none' ? null : trigger });
              track('habit_logged', { kind: 'smoking' });
            }
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

/** New habit from a preset; smoking also asks the old daily count and price for "money saved". */
export function AddHabitSheet({
  open,
  onClose,
  existing,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  existing: HabitKind[];
  defaults?: Partial<Record<HabitKind, number>>;
}) {
  const { create } = useHabitActions();
  const [kind, setKind] = useState<HabitKind>('water');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [baseline, setBaseline] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (!open) return;
    const first = KINDS.find((k) => k === 'custom' || !existing.includes(k)) ?? 'custom';
    setKind(first);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setName(kind === 'custom' ? '' : t(`habits.kind.${kind}`));
    setTarget(String(defaults?.[kind] ?? HABIT_PRESETS[kind].daily_target ?? ''));
  }, [kind, defaults]);
  const limit = kind === 'smoking' || kind === 'alcohol' || kind === 'junk' || kind === 'sugar';
  return (
    <Sheet open={open} onClose={onClose} title={t('habits.add')}>
      <View className="gap-4">
        <ChipRow
          accessibilityLabel={t('habits.type')}
          options={KINDS.filter((k) => k === 'custom' || !existing.includes(k)).map((k) => ({
            id: k,
            label: t(`habits.kind.${k}`),
          }))}
          value={kind}
          onChange={(k) => setKind(k as HabitKind)}
        />
        {kind === 'custom' ? (
          <TextField
            label={t('habits.name')}
            value={name}
            onChangeText={setName}
            placeholder={t('habits.namePlaceholder')}
            maxLength={60}
          />
        ) : null}
        <TextField
          label={limit ? t('habits.limit') : t('habits.target')}
          value={target}
          onChangeText={setTarget}
          inputMode="decimal"
          keyboardType="decimal-pad"
          suffix={HABIT_PRESETS[kind].unit}
        />
        {kind === 'smoking' ? (
          <>
            <TextField
              label={t('habits.baseline')}
              value={baseline}
              onChangeText={setBaseline}
              inputMode="numeric"
              keyboardType="number-pad"
              placeholder="10"
            />
            <TextField
              label={t('habits.price')}
              value={price}
              onChangeText={setPrice}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder="18"
              suffix="₹"
            />
          </>
        ) : null}
        <Button
          label={t('common.save')}
          disabled={!name.trim()}
          onPress={async () => {
            const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Math.max(0, Number(s)));
            await create({
              kind,
              name: name.trim(),
              daily_target: num(target),
              baseline_per_day: kind === 'smoking' ? num(baseline) : null,
              price_per_unit: kind === 'smoking' ? num(price) : null,
            });
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
