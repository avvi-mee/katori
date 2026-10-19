import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Check } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useSession } from '@/features/auth/session';
import { useAcceptInvite, useInvitePreview, useMyCoach } from '@/features/coach/api';
import { t, useLocale } from '@/lib/i18n';
import { setAfterAuth } from '@/lib/redirect';

/** Explicit consent before a trainer can see anything. Revocable any time from Me. */
export default function JoinCoach() {
  useLocale();
  const { colors } = useTheme();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const signedIn = useSession((s) => !!s.session);
  const preview = useInvitePreview(code);
  const current = useMyCoach();
  const accept = useAcceptInvite();
  const name = preview.data?.coach_name ?? t('coach.yourCoach');
  const home = () => router.replace('/');

  return (
    <Screen className="gap-4">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        Katori
      </Text>
      {preview.isLoading ? (
        <Skeleton height={240} radius={20} />
      ) : !preview.data?.valid ? (
        <Card className="gap-3">
          <Text variant="title">{t('join.invalid')}</Text>
          <Text variant="body" className="text-ink-muted">
            {t('join.invalidBody')}
          </Text>
          <Button label={t('join.home')} onPress={home} />
        </Card>
      ) : (
        <>
          <Text variant="display" accessibilityRole="header">
            {t('join.title', { name })}
          </Text>
          <Card className="gap-3">
            <Text variant="heading">{t('join.sees')}</Text>
            {(['meals', 'targets', 'training', 'habits'] as const).map((k) => (
              <View key={k} className="flex-row items-start gap-2">
                <Check color={colors.protein} size={18} />
                <Text variant="body" className="flex-1">
                  {t(`join.sees.${k}`)}
                </Text>
              </View>
            ))}
            <Text variant="caption">{t('join.notSees')}</Text>
            <Text variant="caption">{t('join.revoke')}</Text>
            <Text variant="caption">{t('join.medical')}</Text>
          </Card>
          {current.data ? <Text variant="caption">{t('join.replaces', { name: current.data.coach_name })}</Text> : null}
          {signedIn ? (
            <Button
              label={t('join.accept', { name })}
              loading={accept.isPending}
              onPress={() =>
                accept.mutate(code, {
                  onSuccess: () => {
                    toast({ message: t('join.done', { name }), tone: 'success' });
                    home();
                  },
                  onError: () => toast({ message: t('join.invalid'), tone: 'error' }),
                })
              }
            />
          ) : (
            <Button
              label={t('join.signIn')}
              onPress={() => {
                setAfterAuth(`/join/${code}`);
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
