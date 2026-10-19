import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { ChevronLeft, Plus, Trash2 } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useSession } from '@/features/auth/session';
import { useClients, useClientDetail } from '@/features/coach/api';
import { usePlanDraft } from '@/features/coach/planDraft';
import { useExerciseMap, useTemplates, type TemplateWithExercises } from '@/features/workouts/api';
import { COACH_HOME } from '@/lib/routes';
import { t, useLocale } from '@/lib/i18n';
import { upsertRows } from '@/lib/localRows';
import { supabase } from '@/lib/supabase';

const RANGES = ['3-5', '5-8', '8-12', '12-15', '15-20'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const dayName = (d: number) =>
  new Date(Date.UTC(2026, 9, 18 + d)).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

/** Plan builder (coach's own templates) and, with ?client=, assigning a plan to that client on chosen weekdays. */
export default function CoachPlans() {
  useLocale();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { client } = useLocalSearchParams<{ client?: string }>();
  const uid = useSession((s) => s.session?.user.id);
  const templates = useTemplates();
  const exercises = useExerciseMap();
  const clients = useClients();
  const detail = useClientDetail(client);
  const draft = usePlanDraft();
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [busy, setBusy] = useState(false);
  const mine = (templates.data ?? []).filter((x) => x.owner_id === uid);
  const library = (templates.data ?? []).filter((x) => !x.owner_id);
  const clientName = clients.data?.find((c) => c.profile.id === client)?.profile.name;

  const saveDraft = async () => {
    const id = crypto.randomUUID();
    await upsertRows(qc, 'workout_templates', [
      {
        id,
        owner_id: uid!,
        name: draft.name.trim(),
        split: 'custom',
        notes: null,
        position: 50,
        assigned_by_coach_id: null,
      },
    ]);
    await upsertRows(
      qc,
      'template_exercises',
      draft.items.map((it, position) => ({ template_id: id, position, ...it })),
    );
    draft.reset();
    setBuilding(false);
    setPicked(id);
    toast({ message: t('train.templateSaved'), tone: 'success' });
  };

  const assign = async (tpl: TemplateWithExercises) => {
    if (!client || !uid) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const { error } = await supabase.from('workout_templates').insert({
        id,
        owner_id: client,
        name: tpl.name,
        split: tpl.split ?? 'custom',
        notes: tpl.notes,
        assigned_by_coach_id: uid,
        plan_weekdays: weekdays,
        position: 0,
      });
      if (error) throw error;
      const { error: e2 } = await supabase.from('template_exercises').insert(
        tpl.exercises.map((e) => ({
          template_id: id,
          position: e.position,
          exercise_id: e.exercise_id,
          sets: e.sets,
          rep_min: e.rep_min,
          rep_max: e.rep_max,
          rest_s: e.rest_s,
        })),
      );
      if (e2) {
        await supabase.from('workout_templates').delete().eq('id', id);
        throw e2;
      }
      void detail.refetch();
      void qc.invalidateQueries({ queryKey: ['coach_training'] });
      toast({ message: t('coach.assigned', { name: clientName ?? t('coach.client') }), tone: 'success' });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (planId: string) => {
    const { error } = await supabase.from('workout_templates').delete().eq('id', planId);
    if (error) toast({ message: t('common.error'), tone: 'error' });
    else void detail.refetch();
  };

  const list = (title: string, items: TemplateWithExercises[]) =>
    items.length ? (
      <View className="gap-2">
        <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
          {title}
        </Text>
        {items.map((tpl) => (
          <PressableScale
            key={tpl.id}
            onPress={() => setPicked(picked === tpl.id ? null : tpl.id)}
            accessibilityRole={client ? 'radio' : 'button'}
            aria-checked={client ? picked === tpl.id : undefined}
            accessibilityLabel={tpl.name}
            className={`gap-1 rounded-card border bg-surface p-4 ${picked === tpl.id ? 'border-accent' : 'border-line'}`}
          >
            <Text variant="heading">{tpl.name}</Text>
            <Text variant="caption" numberOfLines={picked === tpl.id ? undefined : 1}>
              {tpl.exercises
                .map(
                  (e) =>
                    `${exercises.get(e.exercise_id)?.name ?? t('train.exercise')} ${e.sets}×${e.rep_min}–${e.rep_max}`,
                )
                .join(' · ')}
            </Text>
          </PressableScale>
        ))}
      </View>
    ) : null;

  const chosen = (templates.data ?? []).find((x) => x.id === picked);

  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace(COACH_HOME))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      <Text variant="display" accessibilityRole="header">
        {client ? t('coach.assignTo', { name: clientName ?? t('coach.client') }) : t('coach.plans')}
      </Text>

      {client && detail.data?.plans.length ? (
        <Card className="gap-2">
          <Text variant="heading">{t('coach.currentPlans')}</Text>
          {detail.data.plans.map((p) => (
            <View key={p.id} className="flex-row items-center gap-2">
              <Text variant="body" className="flex-1">
                {p.name} · {(p.plan_weekdays ?? []).map(dayName).join(', ')}
              </Text>
              <PressableScale
                onPress={() => unassign(p.id)}
                accessibilityLabel={t('coach.unassign', { name: p.name })}
                className="h-11 w-11 items-center justify-center rounded-full"
              >
                <Trash2 color={colors.fat} size={18} />
              </PressableScale>
            </View>
          ))}
        </Card>
      ) : null}

      {building ? (
        <Card className="gap-4">
          <TextField
            label={t('coach.planName')}
            value={draft.name}
            onChangeText={(name) => draft.set({ name })}
            placeholder="Push A"
            maxLength={80}
          />
          {draft.items.map((it, i) => (
            <View key={`${it.exercise_id}-${i}`} className="gap-2 border-t border-line pt-3">
              <View className="flex-row items-center gap-2">
                <Text variant="label" className="flex-1">
                  {exercises.get(it.exercise_id)?.name ?? t('train.exercise')}
                </Text>
                <PressableScale
                  onPress={() => draft.set({ items: draft.items.filter((_, k) => k !== i) })}
                  accessibilityLabel={t('train.removeExercise')}
                  className="h-11 w-11 items-center justify-center rounded-full"
                >
                  <Trash2 color={colors.fat} size={18} />
                </PressableScale>
              </View>
              <Stepper
                label={t('train.sets')}
                value={it.sets}
                step={1}
                min={1}
                max={10}
                format={(v) => `${v} ${t('train.sets').toLowerCase()}`}
                onChange={(sets) => draft.set({ items: draft.items.map((x, k) => (k === i ? { ...x, sets } : x)) })}
              />
              <ChipRow
                accessibilityLabel={t('train.reps')}
                options={RANGES.map((r) => ({ id: r, label: r.replace('-', '–') }))}
                value={`${it.rep_min}-${it.rep_max}`}
                onChange={(r) => {
                  const [lo, hi] = r.split('-').map(Number);
                  draft.set({ items: draft.items.map((x, k) => (k === i ? { ...x, rep_min: lo!, rep_max: hi! } : x)) });
                }}
              />
            </View>
          ))}
          <Button
            label={t('train.addExercises')}
            variant="secondary"
            size="md"
            icon={<Plus color={colors.ink} size={18} />}
            onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'plan' } })}
          />
          <View className="flex-row gap-3">
            <Button label={t('common.cancel')} variant="ghost" className="flex-1" onPress={() => setBuilding(false)} />
            <Button
              label={t('common.save')}
              className="flex-1"
              disabled={!draft.name.trim() || !draft.items.length}
              onPress={saveDraft}
            />
          </View>
        </Card>
      ) : (
        <Button
          label={t('coach.newPlan')}
          variant="secondary"
          icon={<Plus color={colors.ink} size={18} />}
          onPress={() => setBuilding(true)}
        />
      )}

      {list(t('coach.myPlans'), mine)}
      {list(t('train.templates'), library)}

      {client && chosen ? (
        <Card className="gap-3">
          <Text variant="heading">{t('coach.whichDays', { name: chosen.name })}</Text>
          <View className="flex-row flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = weekdays.includes(d);
              return (
                <PressableScale
                  key={d}
                  accessibilityRole="checkbox"
                  aria-checked={on}
                  accessibilityLabel={dayName(d)}
                  onPress={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                  className={`min-h-touch min-w-touch items-center justify-center rounded-full px-3 ${on ? 'bg-accent' : 'border border-line bg-surface-2'}`}
                >
                  <Text variant="label" className={on ? 'text-on-accent' : 'text-ink'}>
                    {dayName(d)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Button label={t('coach.assign')} loading={busy} disabled={!weekdays.length} onPress={() => assign(chosen)} />
        </Card>
      ) : null}
    </Screen>
  );
}
