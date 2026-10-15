import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CoachBubble } from '@/components/CoachBubble';
import { CountUp } from '@/components/CountUp';
import { MacroBar } from '@/components/MacroBar';
import { RangeBadge } from '@/components/RangeBadge';
import { Ring } from '@/components/Ring';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { formatAmount, kcalText } from '@/features/meals/format';
import { useScan } from '@/features/scan/store';
import type { PersonaId } from '@/features/personas/personas';
import { t, useLocale } from '@/lib/i18n';

export default function Result() {
  useLocale();
  const { colors } = useTheme();
  const { result, reset } = useScan();
  const { data: profile } = useProfile();

  if (!result) return <Redirect href="/" />;

  const target = profile?.kcal_target ?? 2000;
  const day = result.day_totals;
  const before = Math.max(day.kcal - result.kcal, 0);
  const done = () => {
    // Every scan step uses replace, so going back closes the whole scan flow and returns to the tabs.
    if (router.canGoBack()) router.back();
    else router.replace('/');
    // Clear after leaving so this screen never re-renders without a result.
    setTimeout(reset, 400);
  };

  return (
    <Screen className="gap-5">
      <Text variant="display" accessibilityRole="header">
        {t('scan.saved')}
      </Text>
      <View className="items-center gap-3">
        {/* The ring springs from the total before this meal to the new total. */}
        <Ring
          progress={day.kcal / target}
          initial={before / target}
          size={220}
          stroke={18}
          accessibilityLabel={`${Math.round(day.kcal)} of ${target} kcal today`}
        >
          <CountUp variant="hero" value={day.kcal} />
          <Text variant="caption">
            {t('scan.dayKcal')} · {kcalText(target)}
          </Text>
        </Ring>
        <View className="flex-row items-center gap-2">
          <RangeBadge low={result.kcal_low} high={result.kcal_high} />
          <Text variant="caption">{t('scan.mealKcal')}</Text>
        </View>
      </View>

      <Card className="gap-3">
        {result.items.map((i) => (
          <View key={i.key} className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="heading">{i.dish}</Text>
              <Text variant="caption">
                {formatAmount(i.qty, i.unit)} · {Math.round(i.grams)} g
                {i.oil_level && i.oil_level !== 'normal' ? ` · ${t(`oil.${i.oil_level}`)} tel` : ''}
              </Text>
            </View>
            <Text variant="label">{kcalText(i.kcal)} kcal</Text>
          </View>
        ))}
      </Card>

      <Card className="gap-3">
        <MacroBar
          label={t('macro.protein')}
          value={day.protein_g}
          target={profile?.protein_target ?? 100}
          color={colors.protein}
          index={0}
        />
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

      {result.coach_message ? (
        <CoachBubble
          persona={result.coach_message.persona as PersonaId}
          text={result.coach_message.text}
          gentle={result.coach_message.gentle}
        />
      ) : null}
      {result.unmatched?.length ? (
        <Text variant="caption">{t('scan.unmatched', { dishes: result.unmatched.join(', ') })}</Text>
      ) : null}

      <Button label={t('scan.done')} onPress={done} />
    </Screen>
  );
}
