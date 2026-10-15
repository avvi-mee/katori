import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useSession } from '@/features/auth/session';
import { startCheckout } from '@/features/billing/checkout';
import { useEntitlement } from '@/features/billing/entitlement';
import { Paywall } from '@/features/billing/Paywall';
import { errorText } from '@/lib/api';
import { t, useLocale } from '@/lib/i18n';

/** Paywall opened when a free limit is hit (NEEDS_PRO) or from Me → plan. */
export default function PaywallScreen() {
  useLocale();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const email = useSession((s) => s.session?.user.email);
  const { isPro } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen className="gap-2">
      <Text variant="display" accessibilityRole="header">
        {t('paywall.title')}
      </Text>
      {isPro ? (
        <>
          <Text variant="body" className="mb-4 text-ink-muted">
            {t('paywall.alreadyPro')}
          </Text>
          <Button label={t('common.close')} onPress={leave} />
        </>
      ) : (
        <>
          <Text variant="body" className="text-ink-muted">
            {from === 'scan' ? t('err.NEEDS_PRO') : t('paywall.subtitle')}
          </Text>
          <Paywall
            sourceScreen={from ?? 'app'}
            busy={busy}
            onChoose={async (plan) => {
              setBusy(true);
              try {
                await startCheckout(plan, { email, onDismiss: () => setBusy(false) });
              } catch (e) {
                toast({ message: errorText(e), tone: 'error' });
                setBusy(false);
              }
            }}
            onSkip={leave}
          />
        </>
      )}
    </Screen>
  );
}
