import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { CoachBubble } from '@/components/CoachBubble';
import { ChevronRight } from '@/components/icons';
import { OptionCard } from '@/components/OptionCard';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { Switch } from '@/components/Switch';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useTheme, useThemePref } from '@/design/theme';
import { useProfile, useUpdateProfile, type ProfileUpdate } from '@/features/auth/profile';
import { useEntitlement } from '@/features/billing/entitlement';
import { signOut, useSession } from '@/features/auth/session';
import { kcalText } from '@/features/meals/format';
import { PERSONAS, personaMeta } from '@/features/personas/personas';
import { SavageSwitch } from '@/features/personas/SavageSwitch';
import { MyCoachSection } from '@/features/coach/MyCoachSection';
import { useGoalsRow, useTargets } from '@/features/goals/api';
import { disablePush, enablePush, pushEnabled } from '@/features/pwa/pwa';
import { callFunction, errorText } from '@/lib/api';
import { isDemo } from '@/lib/demo';
import { setLocale, t, useLocale, type Locale } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {title}
      </Text>
      <Card className="gap-4">{children}</Card>
    </View>
  );
}

export default function Me() {
  const locale = useLocale();
  const email = useSession((s) => s.session?.user.email);
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { pref, setPref } = useThemePref();
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState(false);
  const uid = useSession((s) => s.session?.user.id);
  useEffect(() => {
    pushEnabled()
      .then(setPush)
      .catch(() => setPush(false));
  }, []);

  const togglePush = async (on: boolean) => {
    try {
      if (!on) {
        await disablePush();
        return setPush(false);
      }
      const r = await enablePush(uid!);
      if (r === 'enabled') return setPush(true);
      toast({
        message:
          r === 'needs-install' ? t('me.pushIos') : r === 'denied' ? t('me.pushDenied') : t('me.pushUnsupported'),
      });
    } catch {
      toast({ message: t('common.error'), tone: 'error' });
    }
  };
  const { isPro, subscription, sponsoredBy } = useEntitlement();
  const targets = useTargets();
  const { data: goalsRow } = useGoalsRow();
  const qc = useQueryClient();
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  const cancel = async () => {
    setBusy(true);
    try {
      await callFunction('cancel-subscription', {});
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      toast({ message: t('me.cancelled') });
      setConfirm(null);
    } catch (e) {
      toast({ message: errorText(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await callFunction('delete-account', {});
      setConfirm(null);
      await signOut();
      qc.clear();
      toast({ message: t('me.deleted') });
    } catch (e) {
      toast({ message: errorText(e), tone: 'error' });
      setBusy(false);
    }
  };

  const save = (patch: ProfileUpdate) =>
    update.mutate(patch, { onError: () => toast({ message: t('common.error'), tone: 'error' }) });

  if (!profile) {
    return (
      <Screen className="gap-4">
        <Skeleton width="40%" height={34} />
        <Skeleton height={160} radius={20} />
        <Skeleton height={120} radius={20} />
      </Screen>
    );
  }

  return (
    <Screen className="gap-5">
      <View>
        <Text variant="display" accessibilityRole="header">
          {profile.name ?? t('tabs.me')}
        </Text>
        {email ? <Text variant="caption">{email}</Text> : null}
      </View>

      <Section title={t('me.coach')}>
        <CoachBubble persona={profile.persona} text={personaMeta[profile.persona].sample} />
        <Button label={t('me.changeCoach')} variant="secondary" size="md" onPress={() => setPicking(true)} />
        {profile.persona === 'gym_bro' ? (
          <SavageSwitch value={profile.savage_mode} adultConfirmed={profile.adult_confirmed} onChange={save} />
        ) : null}
        <Switch label={t('me.push')} description={t('me.pushDesc')} value={push} onChange={togglePush} />
        <Switch
          label={t('me.mute')}
          description={t('me.muteDesc')}
          value={profile.nudges_muted}
          onChange={(v) => save({ nudges_muted: v })}
        />
      </Section>

      <Section title={t('me.targets')}>
        <View className="flex-row justify-between">
          <View>
            <Text variant="number">{kcalText(targets.kcal)}</Text>
            <Text variant="caption">{t('onb.plan.kcal')}</Text>
          </View>
          <View className="items-end">
            <Text variant="number">{targets.protein_g} g</Text>
            <Text variant="caption">{t('macro.protein')}</Text>
          </View>
        </View>
        <Text variant="caption">{t('me.floor', { kcal: kcalText(profile.kcal_floor ?? 1200) })}</Text>
        {goalsRow?.updated_by === 'coach' ? <Text variant="caption">{t('me.targetsByCoach')}</Text> : null}
        {goalsRow?.updated_by === 'engine' ? <Text variant="caption">{t('goals.engineUpdated')}</Text> : null}
      </Section>

      <Section title={t('me.goalsSection')}>
        {(
          [
            { label: t('me.goals'), href: '/goals' },
            { label: t('me.body'), href: '/body' },
            { label: t('me.habits'), href: '/habits' },
            { label: t('me.activity'), href: '/activity' },
          ] as const
        ).map((l) => (
          <PressableScale
            key={l.href}
            onPress={() => router.push(l.href)}
            accessibilityRole="link"
            accessibilityLabel={l.label}
            className="min-h-touch flex-row items-center justify-between"
          >
            <Text variant="label">{l.label}</Text>
            <ChevronRight color={colors.inkMuted} size={20} />
          </PressableScale>
        ))}
      </Section>

      <Section title={t('me.calibration')}>
        <ChipRow
          accessibilityLabel={t('onb.calib.title')}
          options={[100, 150, 200].map((ml) => ({ id: String(ml), label: `${ml} ml katori` }))}
          value={String(profile.katori_ml)}
          onChange={(id) => save({ katori_ml: Number(id) })}
        />
        <ChipRow
          accessibilityLabel={t('onb.calib.plate')}
          options={(['small', 'medium', 'large'] as const).map((id) => ({ id, label: `${t(`calib.${id}`)} thali` }))}
          value={profile.plate_size}
          onChange={(id) => save({ plate_size: id as 'small' | 'medium' | 'large' })}
        />
      </Section>

      <Section title={t('me.appearance')}>
        <ChipRow
          accessibilityLabel={t('onb.language')}
          options={[
            { id: 'en', label: 'English' },
            { id: 'hinglish', label: 'Hinglish' },
          ]}
          value={locale}
          onChange={(id) => {
            setLocale(id as Locale);
            save({ locale: id as Locale });
          }}
        />
        <ChipRow
          accessibilityLabel={t('me.appearance')}
          options={(['system', 'light', 'dark'] as const).map((id) => ({ id, label: t(`theme.${id}`) }))}
          value={pref}
          onChange={(id) => setPref(id as typeof pref)}
        />
      </Section>

      <MyCoachSection />

      <Section title={t('me.plan')}>
        {sponsoredBy ? (
          <Text variant="heading">{t('coach.proFromCoach', { name: sponsoredBy })}</Text>
        ) : isPro && subscription ? (
          <>
            <View>
              <Text variant="heading">
                {t('me.proActive', {
                  plan:
                    subscription.plan === 'coach'
                      ? t('coach.trainerPlan')
                      : subscription.plan === 'yearly'
                        ? t('paywall.yearly')
                        : t('paywall.monthly'),
                })}
              </Text>
              {periodEnd ? (
                <Text variant="caption">
                  {subscription.cancel_at_period_end
                    ? t('me.cancels', { date: periodEnd })
                    : t('me.renews', { date: periodEnd })}
                </Text>
              ) : null}
            </View>
            {!subscription.cancel_at_period_end ? (
              <Button label={t('me.cancel')} variant="secondary" size="md" onPress={() => setConfirm('cancel')} />
            ) : null}
          </>
        ) : (
          <>
            {subscription?.status === 'halted' ? (
              <Text variant="label" className="text-fat">
                {t('me.halted')}
              </Text>
            ) : null}
            <Text variant="heading">{t('me.free')}</Text>
            <Button label={t('me.upgrade')} size="md" onPress={() => router.push('/paywall?from=me')} />
          </>
        )}
      </Section>

      {isDemo ? (
        <View className="rounded-card bg-accent-soft p-3">
          <Text variant="label">{t('demo.badge')}</Text>
        </View>
      ) : null}
      <Text variant="caption">{t('me.privacy')}</Text>
      <Button label={t('me.signOut')} variant="secondary" onPress={signOut} />
      <Button label={t('me.delete')} variant="danger" onPress={() => setConfirm('delete')} />

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('me.deleteTitle') : t('me.cancelTitle')}
      >
        <Text variant="body" className="mb-6 text-ink-muted">
          {confirm === 'delete' ? t('me.deleteBody') : t('me.cancelBody', { date: periodEnd })}
        </Text>
        <View className="gap-2">
          <Button
            label={confirm === 'delete' ? t('me.deleteConfirm') : t('me.cancelConfirm')}
            variant="danger"
            loading={busy}
            onPress={confirm === 'delete' ? deleteAccount : cancel}
          />
          <Button
            label={confirm === 'delete' ? t('common.cancel') : t('me.keep')}
            variant="ghost"
            onPress={() => setConfirm(null)}
          />
        </View>
      </Sheet>

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('onb.coach.title')}>
        <View className="gap-2">
          {PERSONAS.map((id) => (
            <OptionCard
              key={id}
              title={personaMeta[id].name}
              subtitle={personaMeta[id].voice}
              selected={profile.persona === id}
              onPress={() => {
                save({ persona: id, savage_mode: id === 'gym_bro' ? profile.savage_mode : false });
                setPicking(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
