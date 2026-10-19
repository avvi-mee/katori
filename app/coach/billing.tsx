import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useSession } from '@/features/auth/session';
import { startCheckout } from '@/features/billing/checkout';
import { isActive, useEntitlement } from '@/features/billing/entitlement';
import { PRICE_PER_CLIENT, useClients, useCoachBilling } from '@/features/coach/api';
import { errorText } from '@/lib/api';
import { COACH_HOME } from '@/lib/routes';
import { t, useLocale } from '@/lib/i18n';

/** ₹99 per active client per month; while it's paid, every linked client gets Pro. */
export default function CoachBilling() {
  useLocale();
  const { colors } = useTheme();
  const email = useSession((s) => s.session?.user.email);
  const clients = useClients();
  const history = useCoachBilling();
  const { subscription } = useEntitlement();
  const [busy, setBusy] = useState(false);
  const n = clients.data?.length ?? 0;
  const coachPlan = subscription?.plan === 'coach' && isActive(subscription) ? subscription : null;

  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace(COACH_HOME))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      <Text variant="display" accessibilityRole="header">
        {t('coach.billing')}
      </Text>

      <Card className="gap-2">
        {clients.isLoading ? (
          <Skeleton height={60} />
        ) : (
          <>
            <Text variant="caption">{t('coach.activeClients')}</Text>
            <Text variant="hero">{n}</Text>
            <Text variant="heading">
              {t('coach.monthly', { amount: (n * PRICE_PER_CLIENT).toLocaleString('en-IN'), price: PRICE_PER_CLIENT })}
            </Text>
            <Text variant="caption">{t('coach.billingNote')}</Text>
          </>
        )}
      </Card>

      {coachPlan ? (
        <Card className="gap-1">
          <Text variant="heading">{t('coach.planActive')}</Text>
          <Text variant="caption">
            {t('coach.planActiveBody', {
              n: coachPlan.quantity ?? 1,
              date: coachPlan.current_period_end
                ? new Date(coachPlan.current_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
                : '–',
            })}
          </Text>
        </Card>
      ) : (
        <Button
          label={t('coach.startPlan')}
          loading={busy}
          disabled={!n}
          onPress={async () => {
            setBusy(true);
            try {
              await startCheckout('coach', { email, onDismiss: () => setBusy(false) });
            } catch (e) {
              toast({ message: errorText(e), tone: 'error' });
              setBusy(false);
            }
          }}
        />
      )}
      {!n ? <Text variant="caption">{t('coach.billingNoClients')}</Text> : null}

      <Text variant="caption" className="mt-2 font-sans-bold uppercase tracking-widest">
        {t('coach.invoices')}
      </Text>
      {(history.data ?? []).length ? (
        history.data!.map((r) => (
          <View
            key={r.period}
            className="flex-row items-center justify-between rounded-card border border-line bg-surface p-4"
          >
            <View>
              <Text variant="label">
                {new Date(`${r.period}T00:00:00Z`).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Text>
              <Text variant="caption">{t('coach.clientsN', { n: r.active_clients })}</Text>
            </View>
            <View className="items-end">
              <Text variant="label">₹{r.amount.toLocaleString('en-IN')}</Text>
              <Text variant="caption">{t(`coach.billStatus.${r.status}`)}</Text>
            </View>
          </View>
        ))
      ) : (
        <Text variant="caption">{t('coach.noInvoices')}</Text>
      )}
    </Screen>
  );
}
