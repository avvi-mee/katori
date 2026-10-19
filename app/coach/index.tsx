import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Check, ChevronLeft, ChevronRight, Share2 } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Switch } from '@/components/Switch';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import { useProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import {
  clientTargets,
  intakeByDay,
  PRICE_PER_CLIENT,
  useBecomeCoach,
  useClients,
  useClientsMeals,
  useClientsTraining,
  useInviteCode,
} from '@/features/coach/api';
import { redFlags, weekStart, type Flag } from '@/features/coach/flags';
import { istDay, istDayRange } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';
import { setAfterAuth } from '@/lib/redirect';

// Invite links point at whichever deployment the coach is using (preview or production).
const APP_URL =
  typeof window !== 'undefined' && window.location ? window.location.origin : 'https://katori.unmatrix.in';

const flagText = (f: Flag) => t(`coach.flag.${f.key}`, { n: f.n });

export default function CoachHome() {
  useLocale();
  const signedIn = useSession((s) => !!s.session);
  const { data: profile, isLoading } = useProfile();
  if (!signedIn) return <Pitch />;
  if (isLoading || !profile)
    return (
      <Screen>
        <Skeleton height={300} radius={20} />
      </Screen>
    );
  if (profile.role !== 'coach') return <BecomeCoach defaultName={profile.name ?? ''} />;
  return <Dashboard />;
}

function BackToApp() {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => router.replace('/')}
      accessibilityLabel={t('coach.backToApp')}
      className="-ml-2 h-11 flex-row items-center gap-1 self-start rounded-full pr-3"
    >
      <ChevronLeft color={colors.ink} size={22} />
      <Text variant="label">{t('coach.backToApp')}</Text>
    </PressableScale>
  );
}

function Pitch() {
  const { colors } = useTheme();
  return (
    <Screen className="gap-4">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {t('coach.forTrainers')}
      </Text>
      <Text variant="display" accessibilityRole="header">
        {t('coach.pitchTitle')}
      </Text>
      <Card className="gap-3">
        {(['dashboard', 'flags', 'comments', 'plans', 'pro'] as const).map((k) => (
          <View key={k} className="flex-row items-start gap-2">
            <Check color={colors.protein} size={18} />
            <Text variant="body" className="flex-1">
              {t(`coach.pitch.${k}`)}
            </Text>
          </View>
        ))}
      </Card>
      <Text variant="heading">{t('coach.price', { price: PRICE_PER_CLIENT })}</Text>
      <Button
        label={t('coach.start')}
        onPress={() => {
          setAfterAuth('/coach');
          router.replace('/sign-in');
        }}
      />
    </Screen>
  );
}

function BecomeCoach({ defaultName }: { defaultName: string }) {
  const become = useBecomeCoach();
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  return (
    <Screen className="gap-4">
      <BackToApp />
      <Text variant="display" accessibilityRole="header">
        {t('coach.becomeTitle')}
      </Text>
      <Text variant="body" className="text-ink-muted">
        {t('coach.becomeBody')}
      </Text>
      <TextField
        label={t('coach.displayName')}
        value={name}
        onChangeText={setName}
        placeholder="Coach Vikram"
        maxLength={60}
      />
      <Switch label={t('coach.agree')} value={agree} onChange={setAgree} />
      <Button
        label={t('coach.becomeCta')}
        disabled={!agree || name.trim().length < 2}
        loading={become.isPending}
        onPress={() =>
          become.mutate(name.trim(), { onError: () => toast({ message: t('common.error'), tone: 'error' }) })
        }
      />
    </Screen>
  );
}

function Dashboard() {
  const { colors } = useTheme();
  const today = istDay();
  const clients = useClients();
  const ids = useMemo(() => (clients.data ?? []).map((c) => c.profile.id), [clients.data]);
  const meals = useClientsMeals(ids);
  const training = useClientsTraining(ids, istDayRange(weekStart(today)).from);
  const invite = useInviteCode(true);
  const link = invite.data ? `${APP_URL}/join/${invite.data}` : null;

  const share = async () => {
    if (!link) return;
    const message = t('coach.inviteMessage', { link });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await navigator.clipboard.writeText(link);
        toast({ message: t('coach.copied'), tone: 'success' });
      } else await Share.share({ message });
    } catch {
      /* dismissed */
    }
  };

  return (
    <Screen className="gap-4">
      <BackToApp />
      <Text variant="display" accessibilityRole="header">
        {t('coach.clients')}
      </Text>

      <Card className="gap-3">
        <Text variant="heading">{t('coach.invite')}</Text>
        {invite.isLoading ? (
          <Skeleton height={20} width={220} />
        ) : (
          <Text variant="label" selectable>
            {link ?? '–'}
          </Text>
        )}
        <Text variant="caption">{t('coach.inviteHint', { code: invite.data ?? '' })}</Text>
        <Button
          label={t('coach.shareInvite')}
          variant="secondary"
          size="md"
          icon={<Share2 color={colors.ink} size={18} />}
          onPress={share}
        />
      </Card>

      <View className="flex-row gap-3">
        <Button
          label={t('coach.plans')}
          variant="secondary"
          size="md"
          className="flex-1"
          onPress={() => router.push('/coach/plans')}
        />
        <Button
          label={t('coach.billing')}
          variant="secondary"
          size="md"
          className="flex-1"
          onPress={() => router.push('/coach/billing')}
        />
      </View>

      {clients.isLoading ? (
        <Skeleton height={88} radius={20} />
      ) : !clients.data?.length ? (
        <Card>
          <Text variant="body" className="text-ink-muted">
            {t('coach.noClients')}
          </Text>
        </Card>
      ) : (
        clients.data.map((c, i) => {
          const list = meals.data?.get(c.profile.id) ?? [];
          const byDay = intakeByDay(list);
          const tg = clientTargets(c);
          const todayIntake = byDay.get(today);
          const last = list[0]?.eaten_at ?? null;
          const plans = training.data?.plans.filter((p) => p.owner_id === c.profile.id) ?? [];
          const flags = redFlags({
            byDay,
            today,
            lastLogDay: last ? istDay(new Date(last)) : null,
            kcalTarget: tg.kcal,
            proteinTarget: tg.protein,
            planWeekdays: [...new Set(plans.flatMap((p) => p.plan_weekdays ?? []))],
            workoutsThisWeek: training.data?.workouts.filter((w) => w.user_id === c.profile.id).length ?? 0,
          });
          return (
            <Card key={c.link_id} enterIndex={i}>
              <PressableScale
                onPress={() => router.push({ pathname: '/coach/client/[id]', params: { id: c.profile.id } })}
                accessibilityLabel={c.profile.name ?? t('coach.client')}
                className="gap-2"
              >
                <View className="flex-row items-center gap-2">
                  <Text variant="heading" className="flex-1">
                    {c.profile.name ?? t('coach.client')}
                  </Text>
                  <ChevronRight color={colors.inkMuted} size={20} />
                </View>
                <Text variant="caption">
                  {t('coach.todayLine', {
                    kcal: Math.round(todayIntake?.kcal ?? 0),
                    kt: tg.kcal,
                    p: Math.round(todayIntake?.protein_g ?? 0),
                    pt: tg.protein,
                  })}{' '}
                  ·{' '}
                  {last
                    ? t('coach.lastLog', {
                        when: new Date(last).toLocaleString('en-IN', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      })
                    : t('coach.neverLogged')}
                </Text>
                {flags.length ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {flags.map((f) => (
                      <View
                        key={f.key}
                        className="rounded-full px-2.5 py-1"
                        style={{ backgroundColor: `${colors.fat}22` }}
                      >
                        <Text variant="caption" className="font-sans-bold" style={{ color: colors.fat }}>
                          {flagText(f)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </PressableScale>
            </Card>
          );
        })
      )}
      <Text variant="caption">{t('coach.medical')}</Text>
    </Screen>
  );
}
