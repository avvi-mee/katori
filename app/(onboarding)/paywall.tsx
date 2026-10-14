import { toast } from '@/components/Toast';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { useUpdateProfile } from '@/features/auth/profile';
import { Paywall } from '@/features/billing/Paywall';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

export default function OnboardingPaywall() {
  useLocale();
  const update = useUpdateProfile();
  const reset = useOnboarding((s) => s.reset);

  // Marking onboarding done flips the route guard to the main app.
  const finish = () =>
    update.mutate(
      { onboarded_at: new Date().toISOString() },
      {
        onSuccess: () => {
          track('onboarding_step', { step: 'paywall' });
          reset();
        },
        onError: () => toast({ message: t('common.error'), tone: 'error' }),
      },
    );

  return (
    <OnboardingShell step="paywall" title={t('paywall.title')} subtitle={t('paywall.subtitle')}>
      <Paywall
        sourceScreen="onboarding"
        busy={update.isPending}
        // shortcut: checkout is wired in Phase 1A step 8; until then Pro picks continue on free.
        onChoose={() => {
          toast({ message: t('paywall.soon') });
          finish();
        }}
        onSkip={finish}
      />
    </OnboardingShell>
  );
}
