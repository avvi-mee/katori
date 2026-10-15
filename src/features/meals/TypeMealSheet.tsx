import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useScan } from '@/features/scan/store';
import { callFunction, errorCode, errorText } from '@/lib/api';
import { t, type MessageKey } from '@/lib/i18n';
import type { DraftResponse } from '@/types/api';
import type { MealType } from '@/types/meal';

import { MEAL_ORDER, mealTypeFor } from './format';

/** "2 roti aur dal" → log-text → the same portion sheet as a scan. */
export function TypeMealSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [mealType, setMealType] = useState<MealType>(mealTypeFor());
  const [busy, setBusy] = useState(false);
  const scan = useScan();

  const submit = async () => {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const draft = await callFunction<DraftResponse>('log-text', { text: text.trim(), meal_type: mealType });
      scan.reset();
      scan.set({ draft, mealType });
      setText('');
      onClose();
      router.push('/scan/confirm-portions');
    } catch (e) {
      if (errorCode(e) === 'NEEDS_PRO') {
        onClose();
        router.push('/paywall?from=text');
      } else toast({ message: errorText(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('food.typeTitle')}>
      <View className="gap-4">
        <TextField
          label={t('food.typeTitle')}
          value={text}
          onChangeText={setText}
          placeholder={t('food.typePlaceholder')}
          autoFocus
          maxLength={300}
          onSubmitEditing={submit}
        />
        <ChipRow
          accessibilityLabel={t('food.mealType')}
          options={MEAL_ORDER.map((id) => ({ id, label: t(`meal.${id}` as MessageKey) }))}
          value={mealType}
          onChange={(id) => setMealType(id as MealType)}
        />
        <Button label={t('food.typeCta')} onPress={submit} loading={busy} disabled={text.trim().length < 2} />
      </View>
    </Sheet>
  );
}
