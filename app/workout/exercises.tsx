import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Image, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Check, ChevronLeft, Plus, Search } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { fonts } from '@/design/tokens';
import { usePreferences } from '@/features/goals/api';
import { useCreateExercise, useExerciseInstructions, useExercises, type Exercise } from '@/features/workouts/api';
import { MUSCLES, searchExercises, titleCase } from '@/features/workouts/format';
import { exerciseImageUrl } from '@/features/workouts/images';
import { useLiveWorkout } from '@/features/workouts/session';
import { t, useLocale } from '@/lib/i18n';
import { Equipment } from '@/types/preferences';

const EQUIPMENT = Equipment.options.filter((e) => !['foam_roll', 'exercise_ball', 'medicine_ball'].includes(e));

/** Exercise library: search by name or Indian gym alias, filter by muscle/equipment; add mode multi-selects. */
export default function Exercises() {
  useLocale();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const adding = mode === 'add';
  const prefs = usePreferences();
  const { data, isLoading } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const results = useMemo(
    () =>
      searchExercises(data ?? [], q, {
        muscle: muscle === 'all' ? null : muscle,
        equipment: equipment === 'all' ? null : equipment,
      }),
    [data, q, muscle, equipment],
  );

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const add = (ids: string[]) => {
    useLiveWorkout.getState().addExercises(
      ids.map((exercise_id) => ({ exercise_id })),
      prefs.default_rest_s,
    );
    router.back();
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="mx-auto w-full max-w-[560px] flex-1">
        <View className="gap-3 px-4" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center gap-1">
            <PressableScale
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'))}
              accessibilityLabel={t('common.back')}
              className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
            >
              <ChevronLeft color={colors.ink} size={24} />
            </PressableScale>
            <Text variant="title" className="flex-1" accessibilityRole="header">
              {adding ? t('train.addExercises') : t('train.library')}
            </Text>
            <PressableScale
              onPress={() => setCreating(true)}
              accessibilityLabel={t('train.createCustom')}
              className="h-11 flex-row items-center gap-1 rounded-full bg-surface-2 px-3"
            >
              <Plus color={colors.ink} size={18} />
              <Text variant="label">{t('train.custom')}</Text>
            </PressableScale>
          </View>
          <View className="min-h-[52px] flex-row items-center gap-2 rounded-input border-2 border-line bg-surface px-3">
            <Search color={colors.inkMuted} size={20} />
            <TextInput
              accessibilityLabel={t('train.searchExercises')}
              placeholder={t('train.searchExercises')}
              placeholderTextColor={colors.inkMuted}
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
              style={
                {
                  flex: 1,
                  minHeight: 48,
                  fontFamily: fonts.sansSemibold,
                  fontSize: 17,
                  color: colors.ink,
                  outlineStyle: 'none',
                } as object
              }
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <ChipRow
              wrap={false}
              accessibilityLabel={t('train.muscle')}
              options={[
                { id: 'all', label: t('train.allMuscles') },
                ...MUSCLES.map((m) => ({ id: m, label: titleCase(m) })),
              ]}
              value={muscle}
              onChange={setMuscle}
            />
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ChipRow
              wrap={false}
              accessibilityLabel={t('train.equipment')}
              options={[
                { id: 'all', label: t('train.allEquipment') },
                ...EQUIPMENT.map((e) => ({ id: e, label: titleCase(e) })),
              ]}
              value={equipment}
              onChange={setEquipment}
            />
          </ScrollView>
        </View>

        {isLoading ? (
          <View className="gap-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={64} radius={16} />
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 120 }}
            ListEmptyComponent={
              <View className="items-center gap-3 py-10">
                <Text variant="body" className="text-center text-ink-muted">
                  {t('train.noResults')}
                </Text>
                <Button label={t('train.createCustom')} variant="secondary" onPress={() => setCreating(true)} />
              </View>
            }
            renderItem={({ item }) => {
              const on = picked.includes(item.id);
              const img = exerciseImageUrl(item.images[0]);
              return (
                <PressableScale
                  onPress={() => (adding ? toggle(item.id) : setDetail(item))}
                  onLongPress={() => setDetail(item)}
                  accessibilityRole={adding ? 'checkbox' : 'button'}
                  aria-checked={adding ? on : undefined}
                  accessibilityLabel={item.name}
                  pressedScale={0.98}
                  className={`min-h-[64px] flex-row items-center gap-3 rounded-card border bg-surface p-2 pr-4 ${on ? 'border-accent' : 'border-line'}`}
                >
                  {img ? (
                    <Image
                      source={{ uri: img }}
                      style={{ width: 48, height: 48, borderRadius: 12 }}
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View className="h-12 w-12 rounded-input bg-surface-2" />
                  )}
                  <View className="flex-1">
                    <Text variant="label" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {[...item.primary_muscles.map(titleCase), item.equipment ? titleCase(item.equipment) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      {item.owner_id ? ` · ${t('train.custom')}` : ''}
                    </Text>
                  </View>
                  {adding ? (
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-full ${on ? 'bg-accent' : 'border-2 border-line'}`}
                    >
                      {on ? <Check color={colors.onAccent} size={16} strokeWidth={3} /> : null}
                    </View>
                  ) : null}
                </PressableScale>
              );
            }}
          />
        )}
      </View>

      {adding && picked.length ? (
        <View className="absolute inset-x-0 bottom-0 px-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <View className="mx-auto w-full max-w-[560px]">
            <Button label={t('train.addN', { n: picked.length })} onPress={() => add(picked)} />
          </View>
        </View>
      ) : null}

      <ExerciseDetail
        exercise={detail}
        onClose={() => setDetail(null)}
        onAdd={adding ? (id) => add([id]) : undefined}
      />
      <CreateExercise
        open={creating}
        initialName={q}
        onClose={() => setCreating(false)}
        onCreated={(e) => {
          setCreating(false);
          if (adding) setPicked((p) => [...p, e.id]);
          toast({ message: t('train.customSaved'), tone: 'success' });
        }}
      />
    </View>
  );
}

function ExerciseDetail({
  exercise,
  onClose,
  onAdd,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onAdd?: (id: string) => void;
}) {
  const steps = useExerciseInstructions(exercise?.slug ? exercise.id : null);
  return (
    <Sheet open={!!exercise} onClose={onClose} title={exercise?.name}>
      {exercise ? (
        <View className="gap-4">
          {exercise.images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {exercise.images.slice(0, 2).map((p) => (
                <Image
                  key={p}
                  source={{ uri: exerciseImageUrl(p)! }}
                  style={{ width: 200, height: 150, borderRadius: 16 }}
                  accessibilityLabel={exercise.name}
                />
              ))}
            </ScrollView>
          ) : null}
          <Text variant="caption">
            {[...exercise.primary_muscles, ...exercise.secondary_muscles].map(titleCase).join(' · ')}
          </Text>
          {steps.isLoading ? (
            <Skeleton height={80} radius={12} />
          ) : (
            (steps.data ?? []).map((s, i) => (
              <Text key={i} variant="body">
                {i + 1}. {s}
              </Text>
            ))
          )}
          {onAdd ? <Button label={t('train.addThis')} onPress={() => onAdd(exercise.id)} /> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function CreateExercise({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (e: Exercise) => void;
}) {
  const create = useCreateExercise();
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<string>('chest');
  const [equipment, setEquipment] = useState<string>('machine');
  const [cardio, setCardio] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={t('train.createCustom')}>
      <View className="gap-4">
        <TextField
          label={t('train.exerciseName')}
          defaultValue={initialName}
          onChangeText={setName}
          placeholder={t('train.exerciseNameHint')}
          maxLength={120}
        />
        <ChipRow
          accessibilityLabel={t('train.type')}
          options={[
            { id: 'strength', label: t('train.strength') },
            { id: 'cardio', label: t('train.cardio') },
          ]}
          value={cardio ? 'cardio' : 'strength'}
          onChange={(v) => setCardio(v === 'cardio')}
        />
        {!cardio ? (
          <>
            <Text variant="label">{t('train.muscle')}</Text>
            <ChipRow
              accessibilityLabel={t('train.muscle')}
              options={MUSCLES.map((m) => ({ id: m, label: titleCase(m) }))}
              value={muscle}
              onChange={setMuscle}
            />
            <Text variant="label">{t('train.equipment')}</Text>
            <ChipRow
              accessibilityLabel={t('train.equipment')}
              options={EQUIPMENT.map((e) => ({ id: e, label: titleCase(e) }))}
              value={equipment}
              onChange={setEquipment}
            />
          </>
        ) : null}
        <Button
          label={t('common.save')}
          disabled={!(name || initialName).trim()}
          onPress={async () =>
            onCreated(
              await create({
                name: (name || initialName).trim(),
                primary_muscles: cardio ? [] : [muscle],
                equipment: cardio ? 'machine' : equipment,
                category: cardio ? 'cardio' : 'strength',
              }),
            )
          }
        />
      </View>
    </Sheet>
  );
}
