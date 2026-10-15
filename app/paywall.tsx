import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { Paywall } from '@/features/billing/Paywall';
import { t, useLocale } from '@/lib/i18n';

/** Paywall opened when a free limit is hit (NEEDS_PRO) or from Me → plan. */
export default function PaywallScreen() {
  useLocale();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen className="gap-2">
      <Text variant="display" accessibilityRole="header">
        {t('paywall.title')}
      </Text>
      {from === 'scan' ? (
        <Text variant="body" className="text-ink-muted">
          {t('err.NEEDS_PRO')}
        </Text>
      ) : (
        <Text variant="body" className="text-ink-muted">
          {t('paywall.subtitle')}
        </Text>
      )}
      <Paywall
        sourceScreen={from ?? 'app'}
        // shortcut: checkout is wired in Phase 1A step 8.
        onChoose={() => toast({ message: t('paywall.soon') })}
        onSkip={leave}
      />
    </Screen>
  );
}
