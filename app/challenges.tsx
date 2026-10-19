import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, ChevronRight, Trophy } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { challengeDay, useChallengeActions, useMyChallenges } from '@/features/reach/api';
import { t, useLocale } from '@/lib/i18n';

export default function Challenges() {
  useLocale();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const list = useMyChallenges();
  const { create } = useChallengeActions();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/me'))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      <Text variant="display" accessibilityRole="header">
        {t('reach.challengeTitle')}
      </Text>
      <Text variant="body" className="text-ink-muted">
        {t('reach.challengeRules')}
      </Text>

      {list.isLoading ? (
        <Skeleton height={72} radius={20} />
      ) : (
        (list.data ?? []).map((c) => {
          const d = challengeDay(c);
          return (
            <PressableScale
              key={c.id}
              onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}
              accessibilityLabel={c.name}
              className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
            >
              <Trophy color={colors.accent} size={22} />
              <View className="flex-1">
                <Text variant="heading">{c.name}</Text>
                <Text variant="caption">
                  {d.upcoming ? t('reach.startsSoon') : d.over ? t('reach.finished') : t('reach.dayOf', { n: d.day })}
                </Text>
              </View>
              <ChevronRight color={colors.inkMuted} size={20} />
            </PressableScale>
          );
        })
      )}

      <Card className="gap-3">
        <Text variant="heading">{t('reach.startChallenge')}</Text>
        <TextField
          label={t('reach.challengeName')}
          value={name}
          onChangeText={setName}
          placeholder={t('reach.challengeNameHint')}
          maxLength={60}
        />
        <Button
          label={t('reach.createChallenge')}
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={async () => {
            setBusy(true);
            try {
              const id = await create(name.trim(), profile?.name?.split(' ')[0] ?? 'Me');
              setName('');
              router.push({ pathname: '/challenge/[id]', params: { id } });
            } catch {
              toast({ message: t('common.error'), tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </Screen>
  );
}
