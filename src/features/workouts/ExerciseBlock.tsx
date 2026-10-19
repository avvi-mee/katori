import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { ChevronDown, ChevronUp, EllipsisVertical, Link2, Plus, Trash2, TrendingUp } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import type { Exercise, WorkoutSet } from './api';
import { fmtKg, isCardio, titleCase } from './format';
import { lastTimeSummary, progressionHint, type SetKind } from './math';
import { useLiveWorkout, type LiveExercise, type LiveSet } from './session';
import { SetRow } from './SetRow';
import { vibrate } from './RestTimer';

const KINDS: SetKind[] = ['warmup', 'working', 'drop', 'failure'];
const RPES = ['0', '6', '7', '8', '9', '10'];
const RESTS = [0, 60, 90, 120, 180, 240];

type Props = {
  ex: LiveExercise;
  info: Exercise | undefined;
  last: WorkoutSet[] | null;
  group: string | null;
  isFirst: boolean;
  isLast: boolean;
};

export function ExerciseBlock({ ex, info, last, group, isFirst, isLast }: Props) {
  const { colors } = useTheme();
  const s = useLiveWorkout.getState();
  const [editing, setEditing] = useState<LiveSet | null>(null);
  const [menu, setMenu] = useState(false);
  const cardio = isCardio(info);
  const lastWorking = last?.filter((x) => x.kind !== 'warmup') ?? [];
  const summary = last ? lastTimeSummary(last) : null;
  const hint = !cardio && last ? progressionHint(last, ex.rep_max, info?.primary_muscles ?? []) : null;
  let workingNo = 0;

  // Ghost values: the same set of last session (by position among working sets), else its last working set.
  const ghostFor = (set: LiveSet, k: number) => {
    if (set.kind === 'warmup') {
      const w = last?.filter((x) => x.kind === 'warmup')[k];
      return w ? { kg: w.kg, reps: w.reps } : null;
    }
    const prev = lastWorking[k] ?? lastWorking.at(-1);
    if (!prev) return null;
    return { kg: hint && set.kind === 'working' ? hint.nextKg : prev.kg, reps: prev.reps };
  };

  const editingLive = editing && ex.sets.find((x) => x.id === editing.id);

  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-3">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5 pl-1">
          {group ? (
            <Text variant="caption" className="font-sans-bold text-accent">
              {t('train.superset', { g: group })}
            </Text>
          ) : null}
          <Text variant="heading">{info?.name ?? t('train.exercise')}</Text>
          <Text variant="caption">
            {summary ? t('train.lastTime', { sets: summary }) : (info?.primary_muscles ?? []).map(titleCase).join(', ')}
          </Text>
          {hint ? (
            <View className="mt-1 flex-row items-center gap-1 self-start rounded-full bg-accent-soft px-3 py-1">
              <TrendingUp color={colors.ink} size={14} />
              <Text variant="caption" className="font-sans-bold text-ink">
                {t('train.tryKg', { kg: fmtKg(hint.nextKg) })}
              </Text>
            </View>
          ) : null}
        </View>
        <PressableScale
          onPress={() => setMenu(true)}
          accessibilityLabel={t('train.exerciseMenu', { name: info?.name ?? '' })}
          className="h-11 w-11 items-center justify-center rounded-full"
        >
          <EllipsisVertical color={colors.ink} size={22} />
        </PressableScale>
      </View>

      <View className="flex-row items-center gap-2 px-1">
        <Text variant="caption" className="w-11 text-center">
          {t('train.set')}
        </Text>
        <Text variant="caption" className="flex-1 text-center">
          {cardio ? t('train.minutes') : t('train.kg')}
        </Text>
        <Text variant="caption" className="flex-1 text-center">
          {cardio ? t('train.km') : `${t('train.reps')} · ${ex.rep_min}–${ex.rep_max}`}
        </Text>
        <Text variant="caption" className="w-10 text-center">
          RPE
        </Text>
        <View className="w-11" />
      </View>

      {ex.sets.map((set) => {
        const k = set.kind === 'warmup' ? ex.sets.filter((x) => x.kind === 'warmup').indexOf(set) : workingNo++;
        const ghost = ghostFor(set, k);
        return (
          <SetRow
            key={set.id}
            n={set.kind === 'warmup' ? k + 1 : workingNo}
            set={set}
            ghost={ghost}
            cardio={cardio}
            onChange={(patch) => s.updateSet(ex.key, set.id, patch)}
            onToggle={() => {
              if (!set.done_at) vibrate(15);
              s.toggleDone(ex.key, set.id, ghost ?? undefined);
            }}
            onEdit={() => setEditing(set)}
          />
        );
      })}

      <Button
        label={t('train.addSet')}
        variant="ghost"
        size="md"
        icon={<Plus color={colors.ink} size={18} />}
        onPress={() => s.addSet(ex.key)}
      />

      <Sheet open={!!editingLive} onClose={() => setEditing(null)} title={t('train.setTitle')}>
        {editingLive ? (
          <View className="gap-5">
            <ChipRow
              accessibilityLabel={t('train.setKind')}
              options={KINDS.map((k) => ({ id: k, label: t(`train.kind.${k}`) }))}
              value={editingLive.kind}
              onChange={(kind) => s.updateSet(ex.key, editingLive.id, { kind: kind as SetKind })}
            />
            {cardio ? (
              <>
                <Stepper
                  label={t('train.minutes')}
                  value={Math.round((editingLive.duration_s ?? 0) / 60)}
                  step={1}
                  min={0}
                  max={600}
                  format={(v) => `${v} min`}
                  onChange={(v) => s.updateSet(ex.key, editingLive.id, { duration_s: v * 60 })}
                />
                <Stepper
                  label={t('train.km')}
                  value={(editingLive.distance_m ?? 0) / 1000}
                  step={0.1}
                  min={0}
                  max={200}
                  format={(v) => `${v.toFixed(1)} km`}
                  onChange={(v) => s.updateSet(ex.key, editingLive.id, { distance_m: Math.round(v * 1000) })}
                />
              </>
            ) : (
              <>
                <Stepper
                  label={t('train.kg')}
                  value={editingLive.kg ?? ghostFor(editingLive, 0)?.kg ?? 0}
                  step={2.5}
                  min={0}
                  max={500}
                  format={(v) => `${fmtKg(v)} kg`}
                  onChange={(kg) => s.updateSet(ex.key, editingLive.id, { kg })}
                />
                <Stepper
                  label={t('train.reps')}
                  value={editingLive.reps ?? ghostFor(editingLive, 0)?.reps ?? 0}
                  step={1}
                  min={0}
                  max={100}
                  format={(v) => `${v} ${t('train.reps').toLowerCase()}`}
                  onChange={(reps) => s.updateSet(ex.key, editingLive.id, { reps })}
                />
                <View className="gap-2">
                  <Text variant="label">{t('train.rpe')}</Text>
                  <ChipRow
                    accessibilityLabel={t('train.rpe')}
                    options={RPES.map((r) => ({ id: r, label: r === '0' ? t('train.noRpe') : r }))}
                    value={String(editingLive.rpe ?? 0)}
                    onChange={(r) => s.updateSet(ex.key, editingLive.id, { rpe: r === '0' ? null : Number(r) })}
                  />
                </View>
              </>
            )}
            <View className="flex-row gap-3">
              <Button
                label={t('train.deleteSet')}
                variant="danger"
                className="flex-1"
                onPress={() => {
                  s.removeSet(ex.key, editingLive.id);
                  setEditing(null);
                }}
              />
              <Button label={t('common.save')} className="flex-1" onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={info?.name ?? t('train.exercise')}>
        <View className="gap-4">
          <View className="gap-2">
            <Text variant="label">{t('train.restTime')}</Text>
            <ChipRow
              accessibilityLabel={t('train.restTime')}
              options={RESTS.map((r) => ({ id: String(r), label: r ? `${r}s` : t('train.off') }))}
              value={String(ex.rest_s)}
              onChange={(r) => s.setRestFor(ex.key, Number(r))}
            />
          </View>
          {!isLast || ex.superset_group != null ? (
            <Button
              label={ex.superset_group != null ? t('train.unlinkSuperset') : t('train.linkSuperset')}
              variant="secondary"
              icon={<Link2 color={colors.ink} size={18} />}
              onPress={() => {
                s.toggleSuperset(ex.key);
                setMenu(false);
              }}
            />
          ) : null}
          <View className="flex-row gap-3">
            <Button
              label={t('train.moveUp')}
              variant="secondary"
              className="flex-1"
              disabled={isFirst}
              icon={<ChevronUp color={colors.ink} size={18} />}
              onPress={() => s.moveExercise(ex.key, -1)}
            />
            <Button
              label={t('train.moveDown')}
              variant="secondary"
              className="flex-1"
              disabled={isLast}
              icon={<ChevronDown color={colors.ink} size={18} />}
              onPress={() => s.moveExercise(ex.key, 1)}
            />
          </View>
          <Button
            label={t('train.removeExercise')}
            variant="danger"
            icon={<Trash2 color={colors.fat} size={18} />}
            onPress={() => {
              setMenu(false);
              s.removeExercise(ex.key);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}
