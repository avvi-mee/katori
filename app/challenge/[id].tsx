import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, Share2 } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { appOrigin, challengeDay, useChallengeActions, useLeaderboard, useMyChallenges } from '@/features/reach/api';
import { shareLink } from '@/features/reach/ReachSection';
import { t, useLocale } from '@/lib/i18n';

const MEDAL = ['🥇', '🥈', '🥉'];

/** Group leaderboard: protein-goal days so far. Counts only; nobody sees anyone's meals. */
export default function ChallengeBoard() {
  useLocale();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const challenges = useMyChallenges();
  const board = useLeaderboard(id);
  const { leave } = useChallengeActions();
  const c = challenges.data?.find((x) => x.id === id);
  const d = c ? challengeDay(c) : null;
  const link = c ? `${appOrigin()}/c/${c.invite_code}` : null;
  const elapsed = d ? (d.upcoming ? 0 : d.day) : 0;

  return (
    <Screen className="gap-4">
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/challenges'))}
        accessibilityLabel={t('common.back')}
        className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
      >
        <ChevronLeft color={colors.ink} size={24} />
      </PressableScale>
      {!c ? (
        challenges.isLoading ? (
          <Skeleton height={240} radius={20} />
        ) : (
          <Text variant="title">{t('reach.badChallenge')}</Text>
        )
      ) : (
        <>
          <View>
            <Text variant="caption">
              {d!.upcoming ? t('reach.startsSoon') : d!.over ? t('reach.finished') : t('reach.dayOf', { n: d!.day })}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {c.name}
            </Text>
          </View>
          <Card className="gap-1">
            {board.isLoading ? (
              <Skeleton height={120} />
            ) : (
              (board.data ?? []).map((r, i) => (
                <View
                  key={r.user_id}
                  className={`min-h-touch flex-row items-center gap-3 rounded-input px-2 ${r.is_me ? 'bg-accent-soft' : ''}`}
                  accessible
                  accessibilityLabel={t('reach.rowLabel', { rank: i + 1, name: r.display_name, n: r.days_hit })}
                >
                  <Text variant="label" className="w-8 text-center">
                    {MEDAL[i] ?? i + 1}
                  </Text>
                  <Text variant="body" className="flex-1">
                    {r.display_name}
                    {r.is_me ? ` (${t('reach.you')})` : ''}
                  </Text>
                  <Text variant="label">{t('reach.daysHit', { n: r.days_hit, of: elapsed })}</Text>
                </View>
              ))
            )}
          </Card>
          <Text variant="caption">{t('reach.privacy')}</Text>
          <Button
            label={t('reach.inviteFriends')}
            variant="secondary"
            icon={<Share2 color={colors.ink} size={18} />}
            onPress={() => link && shareLink(link, t('reach.challengeShare', { name: c.name, link }))}
          />
          <Button
            label={t('reach.leave')}
            variant="ghost"
            onPress={async () => {
              try {
                await leave(c.id);
                router.replace('/challenges');
              } catch {
                toast({ message: t('common.error'), tone: 'error' });
              }
            }}
          />
        </>
      )}
    </Screen>
  );
}
