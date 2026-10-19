import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useProfile } from '@/features/auth/profile';
import { useWeights } from '@/features/body/api';
import { formatPace, paceSecPerKm, runKcal, type RunKind } from '@/features/workouts/math';
import { t } from '@/lib/i18n';

import type { Run } from './api';

const KINDS: RunKind[] = ['run', 'walk', 'cycle'];

export function StepsSheet({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: number | null;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(initial ? String(initial) : '');
  }, [open, initial]);
  const n = Number(text.replace(/[^0-9]/g, ''));
  return (
    <Sheet open={open} onClose={onClose} title={t('activity.stepsTitle')}>
      <View className="gap-4">
        <TextField
          label={t('activity.stepsToday')}
          value={text}
          onChangeText={setText}
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="8000"
          autoFocus
        />
        <Text variant="caption">{t('activity.stepsHint')}</Text>
        <Button label={t('common.save')} disabled={!text || n > 200_000} onPress={() => onSave(n)} />
      </View>
    </Sheet>
  );
}

export function RunSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (r: Pick<Run, 'kind' | 'distance_m' | 'duration_s'>) => void;
}) {
  const { data: profile } = useProfile();
  const { data: weights } = useWeights();
  const [kind, setKind] = useState<RunKind>('run');
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const distance_m = Math.round(Number(km.replace(',', '.')) * 1000) || 0;
  const duration_s = (Number(min) || 0) * 60 + (Number(sec) || 0);
  const valid = distance_m >= 1 && distance_m <= 500_000 && duration_s >= 1 && duration_s <= 86_400;
  const bodyKg = weights?.at(-1)?.weight_kg ?? profile?.weight_kg ?? 70;
  const kcal = runKcal(kind, distance_m, bodyKg);
  return (
    <Sheet open={open} onClose={onClose} title={t('activity.logRun')}>
      <View className="gap-4">
        <ChipRow
          accessibilityLabel={t('activity.type')}
          options={KINDS.map((k) => ({ id: k, label: t(`activity.kind.${k}`) }))}
          value={kind}
          onChange={(k) => setKind(k as RunKind)}
        />
        <TextField
          label={t('activity.distance')}
          value={km}
          onChangeText={setKm}
          inputMode="decimal"
          keyboardType="decimal-pad"
          suffix="km"
          placeholder="5.0"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField
              label={t('activity.minutes')}
              value={min}
              onChangeText={setMin}
              inputMode="numeric"
              keyboardType="number-pad"
              placeholder="30"
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t('activity.seconds')}
              value={sec}
              onChangeText={setSec}
              inputMode="numeric"
              keyboardType="number-pad"
              placeholder="00"
            />
          </View>
        </View>
        {valid ? (
          <Text variant="label">
            {formatPace(paceSecPerKm(distance_m, duration_s))} · {kcal.low}–{kcal.high} kcal
          </Text>
        ) : null}
        <Button label={t('common.save')} disabled={!valid} onPress={() => onSave({ kind, distance_m, duration_s })} />
      </View>
    </Sheet>
  );
}
