import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { MessageSquare } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { t, type MessageKey } from '@/lib/i18n';

import { REACTION_EMOJI, useMarkCommentsRead, useMealComments, useMyCoach, type MealComment } from './api';

type MealLite = { id: string; meal_type: string; meal_items: { dish: string }[] };

const commentText = (c: MealComment) =>
  [c.reaction ? `${REACTION_EMOJI[c.reaction]} ${t(`coach.reaction.${c.reaction}`)}` : null, c.body]
    .filter(Boolean)
    .join(' · ');

/** "Coach Vikram reviewed your lunch" on Today, plus the comments sheet (also opened from a push: /?meal=id). */
export function CoachReviewCard({ meals }: { meals: MealLite[] }) {
  const { colors } = useTheme();
  const { meal: fromPush } = useLocalSearchParams<{ meal?: string }>();
  const coach = useMyCoach();
  const comments = useMealComments(meals.map((m) => m.id));
  const markRead = useMarkCommentsRead();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (fromPush && meals.some((m) => m.id === fromPush)) setOpen(fromPush);
  }, [fromPush, meals]);

  const list = comments.data ?? [];
  const unread = list.filter((c) => !c.read_at);
  const latest = (unread.length ? unread : []).at(-1);
  const openMeal = meals.find((m) => m.id === open);
  const thread = list.filter((c) => c.meal_id === open);

  const show = (mealId: string) => {
    setOpen(mealId);
    void markRead(list.filter((c) => c.meal_id === mealId && !c.read_at).map((c) => c.id));
  };

  return (
    <>
      {latest ? (
        <Card className="border-accent">
          <PressableScale
            onPress={() => show(latest.meal_id)}
            accessibilityLabel={t('coach.reviewed', { name: coach.data?.coach_name ?? t('coach.yourCoach'), meal: '' })}
            className="flex-row items-start gap-3"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
              <MessageSquare color={colors.ink} size={20} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="heading">
                {t('coach.reviewed', {
                  name: coach.data?.coach_name ?? t('coach.yourCoach'),
                  meal: t(
                    `meal.${meals.find((m) => m.id === latest.meal_id)?.meal_type ?? 'lunch'}` as MessageKey,
                  ).toLowerCase(),
                })}
              </Text>
              <Text variant="body" numberOfLines={2}>
                {commentText(latest)}
              </Text>
            </View>
          </PressableScale>
        </Card>
      ) : null}
      <Sheet open={!!openMeal} onClose={() => setOpen(null)} title={t('coach.comments')}>
        {openMeal ? (
          <View className="gap-3">
            <Text variant="caption">{openMeal.meal_items.map((i) => i.dish).join(', ')}</Text>
            {thread.map((c) => (
              <Card key={c.id} className="gap-1">
                <Text variant="body">{commentText(c)}</Text>
                <Text variant="caption">
                  {coach.data?.coach_name ?? t('coach.yourCoach')} ·{' '}
                  {new Date(c.created_at).toLocaleString('en-IN', {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

/** Small speech-bubble count for a meal row. */
export function useCommentCounts(mealIds: string[]) {
  const { data } = useMealComments(mealIds);
  return (id: string) => (data ?? []).filter((c) => c.meal_id === id).length;
}
