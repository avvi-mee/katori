import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { track } from '@/lib/analytics';
import { t } from '@/lib/i18n';

export type Plan = 'monthly' | 'yearly';
export const PRICES: Record<Plan, number> = { monthly: 99, yearly: 499 };

const PERKS = [
  'Unlimited AI photo scans',
  'AI coach replies in your persona',
  'Weekly AI review',
  'Advanced analytics',
];

type Props = { sourceScreen: string; onChoose: (plan: Plan) => void; onSkip: () => void; busy?: boolean };

/** Plan picker. Yearly is the default selection, shown as ₹42/month (docs: Payments). */
export function Paywall({ sourceScreen, onChoose, onSkip, busy }: Props) {
  const { colors } = useTheme();
  const [plan, setPlan] = useState<Plan>('yearly');
  useEffect(() => track('paywall_viewed', { source_screen: sourceScreen }), [sourceScreen]);

  const option = (id: Plan, title: string, price: string, note: string, badge?: string) => (
    <PressableScale
      onPress={() => setPlan(id)}
      accessibilityRole="radio"
      aria-checked={plan === id}
      accessibilityLabel={`${title}, ${price}, ${note}`}
      pressedScale={0.98}
      className={`rounded-card border-2 p-4 ${plan === id ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="heading">{title}</Text>
        {badge ? (
          <View className="rounded-full bg-accent px-2.5 py-1">
            <Text variant="caption" className="font-sans-bold text-on-accent">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="display" className="mt-1">
        {price}
      </Text>
      <Text variant="caption">{note}</Text>
    </PressableScale>
  );

  return (
    <View className="gap-3">
      <View className="mb-2 gap-2">
        {PERKS.map((p) => (
          <View key={p} className="flex-row items-center gap-3">
            <Check color={colors.protein} size={20} />
            <Text variant="body">{p}</Text>
          </View>
        ))}
      </View>
      <View accessibilityRole="radiogroup" className="gap-3">
        {option(
          'yearly',
          t('paywall.yearly'),
          t('paywall.perMonth', { price: Math.round(PRICES.yearly / 12) }),
          t('paywall.perYear', { price: PRICES.yearly }),
          t('paywall.best'),
        )}
        {option('monthly', t('paywall.monthly'), t('paywall.perMonth', { price: PRICES.monthly }), 'Cancel anytime')}
      </View>
      <Button
        label={t('paywall.cta')}
        loading={busy}
        onPress={() => {
          track('checkout_started', { plan, price: PRICES[plan], source_screen: sourceScreen });
          onChoose(plan);
        }}
        className="mt-2"
      />
      <Button label={t('paywall.free')} variant="ghost" onPress={onSkip} />
      <Text variant="caption" className="text-center">
        {t('paywall.freeNote')}
      </Text>
    </View>
  );
}
