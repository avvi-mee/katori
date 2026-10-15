import { toast } from '@/components/Toast';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { useUpdateProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { startCheckout } from '@/features/billing/checkout';
import { Paywall, type Plan } from '@/features/billing/Paywall';
import { track } from '@/lib/analytics';
import { errorText } from '@/lib/api';
import { t, useLocale } from '@/lib/i18n';

export default function OnboardingPaywall() {
  useLocale();
  const update = useUpdateProfile();
  const reset = useOnboarding((s) => s.reset);
  const email = useSession((s) => s.session?.user.email);

  // Marking onboarding done flips the route guard to the main app.
  const finish = () =>
    update.mutateAsync({ onboarded_at: new Date().toISOString() }).then(() => {
      track('onboarding_step', { step: 'paywall' });
      reset();
    });

  // Finish first, so the app opens behind checkout; Pro unlocks live when the payment webhook lands.
  const choose = async (plan: Plan) => {
    try {
      await finish();
      await startCheckout(plan, { email });
    } catch (e) {
      toast({ message: errorText(e), tone: 'error' });
    }
  };

  return (
    <OnboardingShell step="paywall" title={t('paywall.title')} subtitle={t('paywall.subtitle')}>
      <Paywall
        sourceScreen="onboarding"
        busy={update.isPending}
        onChoose={choose}
        onSkip={() => finish().catch(() => toast({ message: t('common.error'), tone: 'error' }))}
      />
    </OnboardingShell>
  );
}
