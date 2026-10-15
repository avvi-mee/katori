import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronLeft, ChevronRight, Plus, Type } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { RangeBadge } from '@/components/RangeBadge';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { useDayMeals } from '@/features/meals/api';
import { formatAmount, kcalText, MEAL_ORDER } from '@/features/meals/format';
import { ManualAddSheet } from '@/features/meals/ManualAddSheet';
import { TypeMealSheet } from '@/features/meals/TypeMealSheet';
import { UsualRow } from '@/features/meals/UsualRow';
import { totals } from '@/features/portions/engine';
import { addDays, istDay } from '@/lib/day';
import { t, useLocale, type MessageKey } from '@/lib/i18n';

export default function Food() {
  useLocale();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const today = istDay();
  const [day, setDay] = useState(today);
  const [typing, setTyping] = useState(false);
  const [adding, setAdding] = useState(false);
  const meals = useDayMeals(day);

  useEffect(() => {
    if (params.type === '1') {
      setTyping(true);
      router.setParams({ type: undefined });
    }
  }, [params.type]);

  const dayTotal = totals(meals.data ?? []);
  const label =
    day === today
      ? t('food.today')
      : new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Screen className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text variant="display" accessibilityRole="header">
          {t('tabs.food')}
        </Text>
        <View className="flex-row items-center">
          <PressableScale
            onPress={() => setDay(addDays(day, -1))}
            accessibilityLabel={t('food.prevDay')}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <ChevronLeft color={colors.ink} size={24} />
          </PressableScale>
          <Text variant="label" className="min-w-[88px] text-center">
            {label}
          </Text>
          <PressableScale
            onPress={() => setDay(addDays(day, 1))}
            disabled={day >= today}
            accessibilityLabel={t('food.nextDay')}
            className={`h-11 w-11 items-center justify-center rounded-full ${day >= today ? 'opacity-30' : ''}`}
          >
            <ChevronRight color={colors.ink} size={24} />
          </PressableScale>
        </View>
      </View>

      <Card className="flex-row items-center justify-between">
        <View>
          <Text variant="number">{kcalText(dayTotal.kcal)} kcal</Text>
          <Text variant="caption">
            {Math.round(dayTotal.protein_g)} g protein · {Math.round(dayTotal.carbs_g)} g carbs ·{' '}
            {Math.round(dayTotal.fat_g)} g fat
          </Text>
        </View>
        {dayTotal.kcal > 0 ? <RangeBadge low={dayTotal.kcal_low} high={dayTotal.kcal_high} /> : null}
      </Card>

      <View className="flex-row gap-2">
        <Button
          size="md"
          className="flex-1"
          label={t('food.scan')}
          icon={<Camera color={colors.onAccent} size={18} />}
          onPress={() => router.push('/scan/camera')}
        />
        <Button
          size="md"
          variant="secondary"
          className="flex-1"
          label={t('food.type')}
          icon={<Type color={colors.ink} size={18} />}
          onPress={() => setTyping(true)}
        />
        <Button
          size="md"
          variant="secondary"
          className="flex-1"
          label={t('food.add')}
          icon={<Plus color={colors.ink} size={18} />}
          onPress={() => setAdding(true)}
        />
      </View>

      {day === today ? <UsualRow /> : null}

      {meals.isPending ? (
        <View className="gap-3">
          <Skeleton height={96} radius={20} />
          <Skeleton height={96} radius={20} />
        </View>
      ) : !meals.data?.length ? (
        <Card>
          <EmptyState
            title={day === today ? t('empty.meals.title') : t('food.emptyDay')}
            body={t('empty.meals.body')}
            action={{ label: t('empty.meals.action'), onPress: () => router.push('/scan/camera') }}
          />
        </Card>
      ) : (
        MEAL_ORDER.map((type) => {
          const group = meals.data.filter((m) => m.meal_type === type);
          if (!group.length) return null;
          return (
            <View key={type} className="gap-2">
              <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
                {t(`meal.${type}` as MessageKey)} · {kcalText(group.reduce((a, m) => a + m.kcal, 0))} kcal
              </Text>
              {group.map((m, i) => (
                <Card key={m.id} enterIndex={i} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text variant="caption">
                      {new Date(m.eaten_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      {m.source === 'outside' ? ' · bahar ka' : ''}
                    </Text>
                    <Text variant="label">{kcalText(m.kcal)} kcal</Text>
                  </View>
                  {m.meal_items.map((it) => (
                    <View key={it.id} className="flex-row justify-between gap-3">
                      <Text variant="body" className="flex-1">
                        {it.dish}
                      </Text>
                      <Text variant="caption">{formatAmount(it.qty, it.unit)}</Text>
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          );
        })
      )}

      <TypeMealSheet open={typing} onClose={() => setTyping(false)} />
      <ManualAddSheet
        open={adding}
        onClose={() => setAdding(false)}
        eatenAt={day === today ? undefined : new Date(`${day}T13:00:00+05:30`).toISOString()}
      />
    </Screen>
  );
}
