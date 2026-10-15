import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { CoachBubble } from '@/components/CoachBubble';
import { CountUp } from '@/components/CountUp';
import { EmptyState } from '@/components/EmptyState';
import { MacroBar } from '@/components/MacroBar';
import { RangeBadge } from '@/components/RangeBadge';
import { Ring } from '@/components/Ring';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { SwipeRow } from '@/components/SwipeRow';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { useDayMeals, useDeleteMeal, useTodayCoach } from '@/features/meals/api';
import { formatAmount, kcalText } from '@/features/meals/format';
import { buildCoachMessage } from '@/features/personas/coach';
import { istHour } from '@/features/personas/facts';
import { totals } from '@/features/portions/engine';
import { istDay } from '@/lib/day';
import { t, useLocale, type MessageKey } from '@/lib/i18n';

const UNDO_MS = 5000;

export default function Today() {
  useLocale();
  const { colors } = useTheme();
  const today = istDay();
  const { data: profile } = useProfile();
  const meals = useDayMeals(today);
  const coach = useTodayCoach(today);
  const del = useDeleteMeal();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const visible = (meals.data ?? []).filter((m) => !pending.has(m.id));
  const day = totals(visible);
  const target = profile?.kcal_target ?? 2000;
  const proteinTarget = profile?.protein_target ?? 100;
  const left = target - day.kcal;

  const unpend = (id: string) =>
    setPending((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  // Swipe hides the meal at once; it is only deleted when the undo window closes.
  const remove = (id: string) => {
    setPending((s) => new Set(s).add(id));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        del.mutate(id, { onSettled: () => unpend(id) });
      }, UNDO_MS),
    );
    toast({
      message: t('today.deleted'),
      action: {
        label: t('common.undo'),
        onPress: () => {
          clearTimeout(timers.current.get(id));
          timers.current.delete(id);
          unpend(id);
        },
      },
    });
  };

  // Before the first saved coach line of the day, show the template the server would use.
  const fallbackCoach =
    profile &&
    buildCoachMessage(
      {
        trigger: 'meal_saved',
        hour: istHour(new Date()),
        kcal: day.kcal,
        protein_g: day.protein_g,
        meals: visible.length,
        kcal_target: target,
        protein_target: proteinTarget,
        kcal_floor: profile.kcal_floor ?? 1200,
        low_days_before: 0,
        diet_type: profile.diet_type,
      },
      profile,
    );

  return (
    <Screen className="gap-4">
      <View>
        <Text variant="caption">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {profile?.name ? t('today.greeting', { name: profile.name.split(' ')[0]! }) : t('today.greetingAnon')}
        </Text>
      </View>

      <Card className="items-center gap-3 py-6">
        {meals.isPending ? (
          <Skeleton width={220} height={220} radius={110} />
        ) : (
          <Ring
            progress={day.kcal / target}
            size={220}
            stroke={18}
            color={left < -target * 0.1 ? colors.fat : colors.accent}
            accessibilityLabel={`${Math.round(day.kcal)} of ${target} kcal`}
          >
            <CountUp variant="hero" value={day.kcal} />
            <Text variant="caption">of {kcalText(target)} kcal</Text>
          </Ring>
        )}
        <View className="flex-row items-center gap-2">
          {day.kcal > 0 ? <RangeBadge low={day.kcal_low} high={day.kcal_high} /> : null}
          <Text variant="label">
            {left >= 0 ? t('today.left', { kcal: kcalText(left) }) : t('today.over', { kcal: kcalText(-left) })}
          </Text>
        </View>
      </Card>

      <Card className="gap-3">
        <MacroBar
          label={t('macro.protein')}
          value={day.protein_g}
          target={proteinTarget}
          color={colors.protein}
          index={0}
        />
        {/* shortcut: carbs/fat guides are 50% / 25% of kcal; per-user macro targets come with the 1B goals engine. */}
        <MacroBar
          label={t('macro.carbs')}
          value={day.carbs_g}
          target={Math.round((target * 0.5) / 4)}
          color={colors.carbs}
          index={1}
        />
        <MacroBar
          label={t('macro.fat')}
          value={day.fat_g}
          target={Math.round((target * 0.25) / 9)}
          color={colors.fat}
          index={2}
        />
      </Card>

      {coach.data ? (
        <CoachBubble persona={coach.data.persona} text={coach.data.text} gentle={coach.data.gentle} />
      ) : fallbackCoach && !profile?.nudges_muted ? (
        <CoachBubble
          persona={fallbackCoach.persona}
          text={fallbackCoach.text}
          gentle={fallbackCoach.tone === 'gentle'}
        />
      ) : null}

      <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
        {t('today.meals')}
      </Text>
      {meals.isPending ? (
        <Skeleton height={88} radius={20} />
      ) : !visible.length ? (
        <Card>
          <EmptyState
            title={t('empty.meals.title')}
            body={t('empty.meals.body')}
            action={{ label: t('empty.meals.action'), onPress: () => router.push('/scan/camera') }}
          />
        </Card>
      ) : (
        <View className="gap-2">
          {visible.map((m) => (
            <SwipeRow key={m.id} onDelete={() => remove(m.id)} deleteLabel={t('today.delete')}>
              <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4">
                <View className="w-16">
                  <Text variant="label">
                    {new Date(m.eaten_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  <Text variant="caption">{t(`meal.${m.meal_type}` as MessageKey)}</Text>
                </View>
                <View className="flex-1">
                  <Text variant="body" numberOfLines={2}>
                    {m.meal_items.map((i) => i.dish).join(', ')}
                  </Text>
                  <Text variant="caption">
                    {m.meal_items[0] ? formatAmount(m.meal_items[0].qty, m.meal_items[0].unit) : ''}
                    {m.meal_items.length > 1 ? ` +${m.meal_items.length - 1}` : ''} · {Math.round(m.protein_g)} g
                    protein
                  </Text>
                </View>
                <Text variant="label">{kcalText(m.kcal)}</Text>
              </View>
            </SwipeRow>
          ))}
        </View>
      )}
    </Screen>
  );
}
