import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Check } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { fonts } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { fmtKg } from './format';
import type { LiveSet } from './session';

const KIND_LABEL = { warmup: 'W', drop: 'D', failure: 'F' } as const;

/** Numeric cell: keeps the typed text (e.g. "62.") while editing, commits numbers as they become valid. */
function NumCell({
  value,
  ghost,
  onCommit,
  label,
  decimal,
  done,
}: {
  value: number | null;
  ghost: number | null | undefined;
  onCommit: (v: number | null) => void;
  label: string;
  decimal?: boolean;
  done: boolean;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(value == null ? '' : fmtKg(value));
  useEffect(() => {
    const parsed = text === '' ? null : Number(text);
    if (parsed !== value) setText(value == null ? '' : fmtKg(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      placeholder={ghost == null ? '–' : fmtKg(ghost)}
      placeholderTextColor={colors.inkMuted}
      inputMode={decimal ? 'decimal' : 'numeric'}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      onChangeText={(s) => {
        const clean = s.replace(',', '.').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
        setText(clean);
        if (clean === '') onCommit(null);
        else if (!Number.isNaN(Number(clean))) onCommit(Number(clean));
      }}
      style={[
        {
          flex: 1,
          minHeight: 44,
          borderRadius: 12,
          textAlign: 'center',
          fontFamily: fonts.sansSemibold,
          fontSize: 18,
          color: colors.ink,
          backgroundColor: done ? 'transparent' : colors.surface2,
          outlineStyle: 'none',
        } as object,
        { fontVariant: ['tabular-nums'] },
      ]}
    />
  );
}

type Props = {
  n: number;
  set: LiveSet;
  ghost: { kg: number | null; reps: number | null } | null;
  cardio: boolean;
  onChange: (patch: Partial<LiveSet>) => void;
  onToggle: () => void;
  onEdit: () => void;
};

/** One set: kind/number (tap for steppers, RPE and kind), kg, reps, tick. Cardio rows log minutes and km. */
export function SetRow({ n, set, ghost, cardio, onChange, onToggle, onEdit }: Props) {
  const { colors } = useTheme();
  const done = !!set.done_at;
  const label = set.kind === 'working' ? String(n) : KIND_LABEL[set.kind];
  return (
    <View className={`flex-row items-center gap-2 rounded-input px-1 py-1 ${done ? 'bg-accent-soft' : ''}`}>
      <PressableScale
        onPress={onEdit}
        accessibilityLabel={t('train.editSet', { n })}
        className="h-11 w-11 items-center justify-center rounded-full"
      >
        <Text variant="label" className={set.kind === 'working' ? 'text-ink' : 'text-accent'}>
          {label}
        </Text>
      </PressableScale>
      {cardio ? (
        <>
          <NumCell
            label={t('train.minutes')}
            value={set.duration_s == null ? null : Math.round(set.duration_s / 60)}
            ghost={null}
            onCommit={(v) => onChange({ duration_s: v == null ? null : Math.round(v * 60) })}
            done={done}
          />
          <NumCell
            label={t('train.km')}
            decimal
            value={set.distance_m == null ? null : set.distance_m / 1000}
            ghost={null}
            onCommit={(v) => onChange({ distance_m: v == null ? null : Math.round(v * 1000) })}
            done={done}
          />
        </>
      ) : (
        <>
          <NumCell
            label={t('train.kg')}
            decimal
            value={set.kg}
            ghost={ghost?.kg}
            onCommit={(kg) => onChange({ kg })}
            done={done}
          />
          <NumCell
            label={t('train.reps')}
            value={set.reps}
            ghost={ghost?.reps}
            onCommit={(reps) => onChange({ reps })}
            done={done}
          />
        </>
      )}
      <View className="w-10 items-center">
        <Text variant="caption">{set.rpe ? `@${fmtKg(set.rpe)}` : ''}</Text>
      </View>
      <PressableScale
        onPress={onToggle}
        accessibilityRole="checkbox"
        aria-checked={done}
        accessibilityLabel={t('train.completeSet', { n })}
        pressedScale={0.85}
        className={`h-11 w-11 items-center justify-center rounded-full ${done ? 'bg-protein' : 'border-2 border-line'}`}
      >
        <Check color={done ? '#fff' : colors.inkMuted} size={22} strokeWidth={3} />
      </PressableScale>
    </View>
  );
}
