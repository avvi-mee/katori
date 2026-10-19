import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { RangeBadge } from '@/components/RangeBadge';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { REACTION_EMOJI, REACTIONS, useCoachComment, useMealComments, type Reaction } from '@/features/coach/api';
import { formatAmount } from '@/features/meals/format';
import { errorText } from '@/lib/api';
import { isDemo } from '@/lib/demo';
import { COACH_HOME } from '@/lib/routes';
import { t, useLocale, type MessageKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/types/meal';

/** Meal review: photo, items, comments and quick reactions. Coaches can comment, never edit. */
export default function MealReview() {
  useLocale();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [text, setText] = useState('');
  const comment = useCoachComment();
  const comments = useMealComments(id ? [id] : []);
  const meal = useQuery({
    queryKey: ['coach_meal', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meals')
        .select(
          'id, user_id, eaten_at, meal_type, photo_path, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, meal_items(id, dish, unit, qty, kcal, protein_g)',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        eaten_at: string;
        meal_type: string;
        photo_path: string | null;
        kcal: number;
        kcal_low: number;
        kcal_high: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        meal_items: { id: string; dish: string; unit: Unit; qty: number; kcal: number; protein_g: number }[];
      } | null;
    },
  });
  const photo = useQuery({
    queryKey: ['meal-photo', meal.data?.photo_path],
    enabled: !!meal.data?.photo_path && !isDemo,
    staleTime: 9 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('meal-photos').createSignedUrl(meal.data!.photo_path!, 600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const send = (b: { body?: string; reaction?: Reaction }) =>
    comment.mutate(
      { meal_id: id!, ...b },
      {
        onSuccess: () => {
          setText('');
          toast({ message: t('coach.sent'), tone: 'success' });
        },
        onError: (e) => toast({ message: errorText(e), tone: 'error' }),
      },
    );

  const m = meal.data;
  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace(COACH_HOME))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      {meal.isLoading ? (
        <Skeleton height={260} radius={20} />
      ) : !m ? (
        <Text variant="title">{t('coach.noAccess')}</Text>
      ) : (
        <>
          <View>
            <Text variant="caption">
              {new Date(m.eaten_at).toLocaleString('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {t(`meal.${m.meal_type}` as MessageKey)}
            </Text>
          </View>
          {photo.data ? (
            <Image
              source={{ uri: photo.data }}
              style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 20 }}
              accessibilityLabel={t('coach.mealPhoto')}
            />
          ) : null}
          <Card className="gap-2">
            {m.meal_items.map((i) => (
              <View key={i.id} className="flex-row justify-between gap-3">
                <Text variant="body" className="flex-1">
                  {i.dish} · {formatAmount(Number(i.qty), i.unit)}
                </Text>
                <Text variant="label">{Math.round(Number(i.kcal))} kcal</Text>
              </View>
            ))}
            <View className="mt-1 flex-row items-center gap-2">
              <RangeBadge low={Number(m.kcal_low)} high={Number(m.kcal_high)} />
              <Text variant="caption">
                {Math.round(Number(m.protein_g))} g protein · {Math.round(Number(m.carbs_g))} g carbs ·{' '}
                {Math.round(Number(m.fat_g))} g fat
              </Text>
            </View>
          </Card>

          <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
            {t('coach.comments')}
          </Text>
          {(comments.data ?? []).map((c) => (
            <Card key={c.id} className="gap-1">
              <Text variant="body">
                {c.reaction ? `${REACTION_EMOJI[c.reaction]} ${t(`coach.reaction.${c.reaction}`)}` : ''}
                {c.reaction && c.body ? ' · ' : ''}
                {c.body ?? ''}
              </Text>
              <Text variant="caption">
                {new Date(c.created_at).toLocaleString('en-IN', {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {c.read_at ? ` · ${t('coach.seen')}` : ''}
              </Text>
            </Card>
          ))}
          <View className="flex-row flex-wrap gap-2">
            {REACTIONS.map((r) => (
              <PressableScale
                key={r}
                onPress={() => send({ reaction: r })}
                accessibilityLabel={t(`coach.reaction.${r}`)}
                className="min-h-touch flex-row items-center gap-1 rounded-full border border-line bg-surface px-3"
              >
                <Text variant="label">{REACTION_EMOJI[r]}</Text>
                <Text variant="label">{t(`coach.reaction.${r}`)}</Text>
              </PressableScale>
            ))}
          </View>
          <TextField
            label={t('coach.commentLabel')}
            value={text}
            onChangeText={setText}
            placeholder={t('coach.commentPlaceholder')}
            maxLength={1000}
            multiline
          />
          <Button
            label={t('coach.send')}
            loading={comment.isPending}
            disabled={!text.trim()}
            onPress={() => send({ body: text.trim() })}
          />
        </>
      )}
    </Screen>
  );
}
