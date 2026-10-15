import { Plus } from '@/components/icons';
import { ScrollView, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { errorText } from '@/lib/api';
import { t } from '@/lib/i18n';

import { useConfirmMeal, useDeleteMeal, useUsualDishes, type UsualDish } from './api';
import { formatAmount, kcalText, mealTypeFor } from './format';

/** One-tap "my usual": logs the dish at the user's usual portion, with Undo. */
export function UsualRow() {
  const { colors } = useTheme();
  const usual = useUsualDishes();
  const confirm = useConfirmMeal();
  const del = useDeleteMeal();

  if (usual.isPending) {
    return (
      <View className="flex-row gap-2">
        <Skeleton width={140} height={60} radius={20} />
        <Skeleton width={140} height={60} radius={20} />
      </View>
    );
  }
  if (!usual.data?.length) return null;

  const add = (u: UsualDish) =>
    confirm.mutate(
      {
        client_id: crypto.randomUUID(),
        meal_type: mealTypeFor(),
        source: 'home',
        items: [{ food_item_id: u.food_item_id, unit: u.unit, qty: u.qty, oil_level: u.oil_level }],
      },
      {
        onSuccess: (res) =>
          toast({
            message: res.queued ? t('sync.savedOffline') : t('food.saved', { kcal: kcalText(res.kcal) }),
            tone: 'success',
            action: { label: t('common.undo'), onPress: () => del.mutate(res.meal_id) },
          }),
        onError: (e) => toast({ message: errorText(e), tone: 'error' }),
      },
    );

  return (
    <View className="gap-2">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {t('food.usual')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {usual.data.map((u) => (
          <PressableScale
            key={u.food_item_id}
            onPress={() => add(u)}
            disabled={confirm.isPending}
            accessibilityLabel={t('food.addUsual', { dish: u.name, amount: formatAmount(u.qty, u.unit) })}
            pressedScale={0.95}
            className="min-h-[60px] flex-row items-center gap-3 rounded-card border border-line bg-surface py-2 pl-4 pr-3"
          >
            <View>
              <Text variant="label">{u.name}</Text>
              <Text variant="caption">{formatAmount(u.qty, u.unit)}</Text>
            </View>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-accent-soft">
              <Plus color={colors.ink} size={18} />
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}
