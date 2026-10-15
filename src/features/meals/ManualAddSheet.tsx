import { ChevronLeft } from '@/components/icons';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { computeItem, gramsPerUnit } from '@/features/portions/engine';
import { errorText } from '@/lib/api';
import { t, type MessageKey } from '@/lib/i18n';
import type { MealType, OilLevel, Unit } from '@/types/meal';

import { useConfirmMeal, useFoodItems, type FoodRow } from './api';
import { formatAmount, kcalText, MEAL_ORDER, mealTypeFor } from './format';
import { searchFoods } from './search';

const STEP: Record<Unit, { step: number; min: number; max: number }> = {
  katori: { step: 0.5, min: 0.5, max: 4 },
  plate: { step: 0.5, min: 0.5, max: 3 },
  glass: { step: 0.5, min: 0.5, max: 4 },
  roti: { step: 1, min: 1, max: 12 },
  piece: { step: 1, min: 1, max: 20 },
  scoop: { step: 1, min: 1, max: 6 },
  tbsp: { step: 1, min: 1, max: 8 },
  g: { step: 25, min: 25, max: 1000 },
};
const ALL_UNITS: Unit[] = ['katori', 'roti', 'piece', 'plate', 'scoop', 'glass', 'tbsp', 'g'];

type Props = { open: boolean; onClose: () => void; eatenAt?: string };

/** Search the dish database and add a portion — no AI, unlimited, works from the cached table. */
export function ManualAddSheet({ open, onClose, eatenAt }: Props) {
  const { colors } = useTheme();
  const foods = useFoodItems();
  const { data: profile } = useProfile();
  const confirm = useConfirmMeal();
  const [query, setQuery] = useState('');
  const [food, setFood] = useState<FoodRow | null>(null);
  const [unit, setUnit] = useState<Unit>('katori');
  const [qty, setQty] = useState(1);
  const [oil, setOil] = useState<OilLevel>('normal');
  const [mealType, setMealType] = useState<MealType>(mealTypeFor());

  const ctx = { katori_ml: profile?.katori_ml ?? 150, plate_size: profile?.plate_size ?? 'medium' };
  const results = useMemo(() => searchFoods(foods.data ?? [], query), [foods.data, query]);
  // Offer the units a person would use for this dish: its default, explicit per-unit weights, katori
  // when we know the density, and grams. (glass/tbsp volume fallbacks make no sense for rice.)
  const units = food
    ? ALL_UNITS.filter(
        (u) =>
          u === food.units.default ||
          u === 'g' ||
          typeof food.units[u] === 'number' ||
          (u === 'katori' && gramsPerUnit(food, u, ctx) !== null),
      )
    : [];
  const preview = food
    ? computeItem(
        food,
        { key: 'x', dish: food.name, unit, qty, oil_level: oil, confidence: 1, certainty: 'asked' },
        ctx,
        'home',
      )
    : null;

  const pick = (f: FoodRow) => {
    const u = f.units.default as Unit;
    setFood(f);
    setUnit(u);
    setQty(u === 'g' ? 100 : 1);
    setOil('normal');
  };

  const close = () => {
    setFood(null);
    setQuery('');
    onClose();
  };

  const save = () => {
    if (!food) return;
    confirm.mutate(
      {
        client_id: crypto.randomUUID(),
        meal_type: mealType,
        source: 'home',
        items: [{ food_item_id: food.id, unit, qty, oil_level: food.default_oil_g > 0 ? oil : null }],
        ...(eatenAt ? { eaten_at: eatenAt } : {}),
      },
      {
        onSuccess: (res) => {
          toast({
            message: res.queued ? t('sync.savedOffline') : t('food.saved', { kcal: kcalText(res.kcal) }),
            tone: 'success',
          });
          close();
        },
        onError: (e) => toast({ message: errorText(e), tone: 'error' }),
      },
    );
  };

  return (
    <Sheet open={open} onClose={close} title={food ? undefined : t('food.addTitle')}>
      {!food ? (
        <View className="gap-3">
          <TextField
            label={t('food.search')}
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="dal, roti, paneer…"
          />
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {foods.isPending ? (
              <View className="gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={52} />
                ))}
              </View>
            ) : query && !results.length ? (
              <Text variant="body" className="py-4 text-ink-muted">
                {t('food.noResults')}
              </Text>
            ) : (
              results.map((f) => (
                <PressableScale
                  key={f.id}
                  onPress={() => pick(f)}
                  accessibilityLabel={f.name}
                  pressedScale={0.98}
                  className="min-h-[52px] justify-center border-b border-line py-2"
                >
                  <Text variant="heading">{f.name}</Text>
                  <Text variant="caption">
                    {Math.round(f.kcal_100g)} kcal · {f.protein_100g} g protein / 100 g
                  </Text>
                </PressableScale>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <View className="gap-5">
          <View className="flex-row items-center gap-2">
            <PressableScale
              onPress={() => setFood(null)}
              accessibilityLabel={t('common.back')}
              className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
            >
              <ChevronLeft color={colors.ink} size={26} />
            </PressableScale>
            <Text variant="title" className="flex-1">
              {food.name}
            </Text>
          </View>
          <View className="gap-2">
            <Text variant="label">{t('food.amount')}</Text>
            <Stepper
              value={qty}
              onChange={setQty}
              {...STEP[unit]}
              label={t('food.amount')}
              format={(v) => formatAmount(v, unit)}
            />
          </View>
          {units.length > 1 ? (
            <View className="gap-2">
              <Text variant="label">{t('food.unit')}</Text>
              <ChipRow
                accessibilityLabel={t('food.unit')}
                options={units.map((u) => ({ id: u, label: u }))}
                value={unit}
                onChange={(id) => {
                  const u = id as Unit;
                  setUnit(u);
                  setQty(u === 'g' ? 100 : 1);
                }}
              />
            </View>
          ) : null}
          {food.default_oil_g > 0 ? (
            <View className="gap-2">
              <Text variant="label">{t('food.oil')}</Text>
              <ChipRow
                accessibilityLabel={t('food.oil')}
                options={(['kam', 'normal', 'zyada'] as OilLevel[]).map((id) => ({ id, label: t(`oil.${id}`) }))}
                value={oil}
                onChange={(id) => setOil(id as OilLevel)}
              />
            </View>
          ) : null}
          <View className="gap-2">
            <Text variant="label">{t('food.mealType')}</Text>
            <ChipRow
              accessibilityLabel={t('food.mealType')}
              options={MEAL_ORDER.map((id) => ({ id, label: t(`meal.${id}` as MessageKey) }))}
              value={mealType}
              onChange={(id) => setMealType(id as MealType)}
            />
          </View>
          {preview ? (
            <Text variant="caption">
              ~{Math.round(preview.grams)} g · {kcalText(preview.kcal_low)}–{kcalText(preview.kcal_high)} kcal ·{' '}
              {Math.round(preview.protein_g)} g protein
            </Text>
          ) : null}
          <Button
            label={t('food.save', { kcal: kcalText(preview?.kcal ?? 0) })}
            onPress={save}
            loading={confirm.isPending}
          />
        </View>
      )}
    </Sheet>
  );
}
