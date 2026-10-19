import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { useChallengeActions, useChallengePreview } from '@/features/reach/api';
import { t, useLocale } from '@/lib/i18n';
import { setAfterAuth } from '@/lib/redirect';

/** Join a 30-day protein challenge from a friend's link. */
export default function JoinChallenge() {
  useLocale();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const signedIn = useSession((s) => !!s.session);
  const { data: profile } = useProfile();
  const preview = useChallengePreview(code);
  const { join } = useChallengeActions();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const displayName = name ?? profile?.name?.split(' ')[0] ?? '';

  return (
    <Screen className="gap-4">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        Katori
      </Text>
      {preview.isLoading ? (
        <Skeleton height={200} radius={20} />
      ) : !preview.data ? (
        <Card className="gap-3">
          <Text variant="title">{t('reach.badChallenge')}</Text>
          <Button label={t('join.home')} onPress={() => router.replace('/')} />
        </Card>
      ) : (
        <>
          <Text variant="display" accessibilityRole="header">
            {preview.data.name}
          </Text>
          <Card className="gap-2">
            <Text variant="body">{t('reach.challengeRules')}</Text>
            <Text variant="caption">
              {t('reach.challengeMeta', {
                n: preview.data.members,
                date: new Date(`${preview.data.starts_on}T00:00:00Z`).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }),
              })}
            </Text>
            <Text variant="caption">{t('reach.privacy')}</Text>
          </Card>
          {signedIn ? (
            <>
              <TextField label={t('reach.boardName')} value={displayName} onChangeText={setName} maxLength={40} />
              <Button
                label={t('reach.join')}
                loading={busy}
                disabled={!displayName.trim()}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const id = await join(code, displayName.trim());
                    router.replace({ pathname: '/challenge/[id]', params: { id } });
                  } catch {
                    toast({ message: t('reach.cantJoin'), tone: 'error' });
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : (
            <Button
              label={t('reach.signUp')}
              onPress={() => {
                setAfterAuth(`/c/${code}`);
                router.replace('/sign-in');
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
