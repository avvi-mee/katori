import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PortionSheet } from '@/components/PortionSheet';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { formatAmount } from '@/features/meals/format';
import { useConfirmMeal } from '@/features/meals/api';
import { useScan } from '@/features/scan/store';
import { track } from '@/lib/analytics';
import { errorText } from '@/lib/api';
import { t, useLocale } from '@/lib/i18n';
import type { Answer } from '@/types/meal';

export default function ConfirmPortions() {
  useLocale();
  const { photo, draft, takenAt, set } = useScan();
  const [open, setOpen] = useState(true);
  const confirm = useConfirmMeal();
  // One id per draft so a double tap or retry can never save the meal twice.
  const [clientId] = useState(() => crypto.randomUUID());

  if (!draft) return <Redirect href="/scan/camera" />;

  const save = (answers: Answer[]) => {
    for (const a of answers) {
      const q = draft.questions.find((x) => x.id === a.question_id);
      if (q && a.option_id !== q.default_option) {
        const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
        track('item_edited', { field: q.kind, from: label(q.default_option), to: label(a.option_id) });
      }
    }
    confirm.mutate(
      // Photos analysed later (saved offline) are logged at the time they were taken.
      { client_id: clientId, draft_id: draft.draft_id, answers, ...(takenAt ? { eaten_at: takenAt } : {}) },
      {
        onSuccess: (result) => {
          set({ result });
          router.replace('/scan/result');
        },
        onError: (e) => toast({ message: errorText(e), tone: 'error' }),
      },
    );
  };

  return (
    <Screen className="gap-4">
      {photo ? (
        <Image
          source={{ uri: photo.url }}
          style={{ width: '100%', height: 180, borderRadius: 20 }}
          resizeMode="cover"
          accessibilityLabel="Your meal photo"
        />
      ) : null}
      <Text variant="title">{t('scan.detected')}</Text>
      <Card className="gap-3">
        {draft.items.map((i) => (
          <View key={i.key} className="flex-row items-center justify-between gap-3">
            <Text variant="heading" className={`flex-1 ${i.food_item_id ? '' : 'text-ink-muted line-through'}`}>
              {i.dish}
            </Text>
            <Text variant="caption">{formatAmount(i.qty, i.unit)}</Text>
          </View>
        ))}
      </Card>
      {draft.unmatched.length ? (
        <View className="rounded-card bg-accent-soft p-4">
          <Text variant="label">{t('scan.unmatched', { dishes: draft.unmatched.join(', ') })}</Text>
        </View>
      ) : null}
      {!open ? <Button label={t('scan.review')} onPress={() => setOpen(true)} /> : null}

      <PortionSheet
        open={open}
        onClose={() => setOpen(false)}
        questions={draft.questions}
        onConfirm={save}
        saving={confirm.isPending}
      />
    </Screen>
  );
}
