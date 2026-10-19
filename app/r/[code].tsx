import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useSession } from '@/features/auth/session';
import { useRedeemReferral, useReferralPreview } from '@/features/reach/api';
import { t, useLocale } from '@/lib/i18n';
import { setAfterAuth } from '@/lib/redirect';

/** Referral landing: a friend's invite. Both get a free month of Pro once the new user logs 3 meals. */
export default function ReferralLanding() {
  useLocale();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const signedIn = useSession((s) => !!s.session);
  const preview = useReferralPreview(code);
  const redeem = useRedeemReferral();
  const name = preview.data ?? t('reach.aFriend');
  const home = () => router.replace('/');

  return (
    <Screen className="gap-4">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        Katori
      </Text>
      {preview.isLoading ? (
        <Skeleton height={200} radius={20} />
      ) : !preview.data ? (
        <Card className="gap-3">
          <Text variant="title">{t('reach.badInvite')}</Text>
          <Button label={t('join.home')} onPress={home} />
        </Card>
      ) : (
        <>
          <Text variant="display" accessibilityRole="header">
            {t('reach.landingTitle', { name })}
          </Text>
          <Card className="gap-2">
            <Text variant="body">{t('reach.landingBody')}</Text>
            <Text variant="caption">{t('reach.landingRule')}</Text>
          </Card>
          {signedIn ? (
            <Button
              label={t('reach.claim')}
              loading={redeem.isPending}
              onPress={() =>
                redeem.mutate(code, {
                  onSuccess: () => {
                    toast({ message: t('reach.claimed'), tone: 'success' });
                    home();
                  },
                  onError: (e) => {
                    toast({
                      message: /new accounts/.test(String((e as Error).message))
                        ? t('reach.oldAccount')
                        : t('reach.cantClaim'),
                      tone: 'error',
                    });
                    home();
                  },
                })
              }
            />
          ) : (
            <Button
              label={t('reach.signUp')}
              onPress={() => {
                setAfterAuth(`/r/${code}`);
                router.replace('/sign-in');
              }}
            />
          )}
          <Button label={t('join.notNow')} variant="ghost" onPress={home} />
        </>
      )}
    </Screen>
  );
}
