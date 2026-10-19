import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useProfile } from '@/features/auth/profile';
import { t } from '@/lib/i18n';
import { COACH_HOME } from '@/lib/routes';

import { useLeaveCoach, useMyCoach } from './api';

/** Me → "Your trainer": who sees your data, and a leave button that ends access immediately. */
export function MyCoachSection() {
  const { data: profile } = useProfile();
  const coach = useMyCoach();
  const leave = useLeaveCoach();
  const [confirm, setConfirm] = useState(false);
  const isCoach = profile?.role === 'coach';

  return (
    <View className="gap-2">
      <Text variant="caption" className="font-sans-bold uppercase tracking-widest">
        {t('coach.section')}
      </Text>
      <Card className="gap-3">
        {coach.data ? (
          <>
            <Text variant="heading">{coach.data.coach_name}</Text>
            <Text variant="caption">
              {t('coach.sharingSince', {
                date: new Date(coach.data.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
              })}
            </Text>
            <Button label={t('coach.leave')} variant="secondary" size="md" onPress={() => setConfirm(true)} />
          </>
        ) : (
          <Text variant="body" className="text-ink-muted">
            {t('coach.none')}
          </Text>
        )}
        <Button
          label={isCoach ? t('coach.openDashboard') : t('coach.areYouTrainer')}
          variant="ghost"
          size="md"
          onPress={() => router.push(COACH_HOME)}
        />
      </Card>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('coach.leaveTitle', { name: coach.data?.coach_name ?? '' })}
      >
        <Text variant="body" className="mb-6 text-ink-muted">
          {t('coach.leaveBody')}
        </Text>
        <View className="gap-2">
          <Button
            label={t('coach.leave')}
            variant="danger"
            loading={leave.isPending}
            onPress={() =>
              coach.data &&
              leave.mutate(coach.data.link_id, {
                onSuccess: () => {
                  setConfirm(false);
                  toast({ message: t('coach.left'), tone: 'success' });
                },
                onError: () => toast({ message: t('common.error'), tone: 'error' }),
              })
            }
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </View>
  );
}
