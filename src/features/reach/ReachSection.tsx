import { router } from 'expo-router';
import { Linking, Platform, Share, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Share2, Trophy } from '@/components/icons';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { isDemo } from '@/lib/demo';
import { t } from '@/lib/i18n';

import { appOrigin, TELEGRAM_BOT, useReferral, useTelegramLink } from './api';

async function shareLink(link: string, message: string) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
      await navigator.clipboard.writeText(link);
      toast({ message: t('coach.copied'), tone: 'success' });
    } else await Share.share({ message });
  } catch {
    /* dismissed */
  }
}

/** Me → invite friends (both get a free month), challenges, Telegram. */
export function ReachSection() {
  const { colors } = useTheme();
  const referral = useReferral();
  const telegram = useTelegramLink();
  const link = referral.data ? `${appOrigin()}/r/${referral.data.code}` : null;

  return (
    <View className="gap-2">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {t('reach.section')}
      </Text>
      <Card className="gap-3">
        <Text variant="heading">{t('reach.inviteTitle')}</Text>
        <Text variant="caption">{t('reach.inviteBody')}</Text>
        {referral.isLoading ? (
          <Skeleton height={20} width={220} />
        ) : link ? (
          <Text variant="label" selectable>
            {link}
          </Text>
        ) : null}
        {referral.data?.joined ? (
          <Text variant="caption">
            {t('reach.inviteStats', { n: referral.data.joined, r: referral.data.rewarded })}
          </Text>
        ) : null}
        <Button
          label={t('reach.share')}
          variant="secondary"
          size="md"
          icon={<Share2 color={colors.ink} size={18} />}
          disabled={!link}
          onPress={() => link && shareLink(link, t('reach.shareMessage', { link }))}
        />
      </Card>
      <Card className="gap-3">
        <View className="flex-row items-center gap-2">
          <Trophy color={colors.accent} size={20} />
          <Text variant="heading">{t('reach.challengeTitle')}</Text>
        </View>
        <Text variant="caption">{t('reach.challengeBody')}</Text>
        <Button
          label={t('reach.openChallenges')}
          variant="secondary"
          size="md"
          onPress={() => router.push('/challenges')}
        />
      </Card>
      {TELEGRAM_BOT || isDemo ? (
        <Card className="gap-3">
          <Text variant="heading">{t('reach.telegramTitle')}</Text>
          <Text variant="caption">{telegram.linked ? t('reach.telegramLinked') : t('reach.telegramBody')}</Text>
          {telegram.linked ? (
            <Button label={t('reach.telegramUnlink')} variant="ghost" size="md" onPress={() => telegram.unlink()} />
          ) : (
            <Button
              label={t('reach.telegramConnect')}
              variant="secondary"
              size="md"
              onPress={async () => {
                try {
                  const url = await telegram.makeLink();
                  if (isDemo) toast({ message: t('reach.telegramDemo'), tone: 'success' });
                  else await Linking.openURL(url);
                } catch {
                  toast({ message: t('common.error'), tone: 'error' });
                }
              }}
            />
          )}
        </Card>
      ) : null}
    </View>
  );
}

export { shareLink };
