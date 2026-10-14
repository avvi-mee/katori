import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import type { Answer, Question } from '@/types/meal';

import { Button } from './Button';
import { ChipRow } from './ChipRow';
import { Sheet } from './Sheet';
import { Text } from './Text';

type Props = {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  onConfirm: (answers: Answer[]) => void;
  saving?: boolean;
};

const defaults = (qs: Question[]) => Object.fromEntries(qs.map((q) => [q.id, q.default_option]));

/** ≤ 3 chip-row questions with the best guess pre-selected; "Looks right" accepts in one tap. */
export function PortionSheet({ open, onClose, questions, onConfirm, saving }: Props) {
  const [picked, setPicked] = useState<Record<string, string>>(() => defaults(questions));
  useEffect(() => setPicked(defaults(questions)), [questions]);

  const confirm = () =>
    onConfirm(questions.map((q) => ({ question_id: q.id, option_id: picked[q.id] ?? q.default_option })));

  return (
    <Sheet open={open} onClose={onClose} title={t('portion.title')}>
      <Text variant="caption" className="-mt-2 mb-5">
        {questions.length ? t('portion.subtitle') : t('portion.allSet')}
      </Text>
      <View className="mb-6 gap-5">
        {questions.map((q) => (
          <View key={q.id} className="gap-2.5">
            <Text variant="heading">{q.prompt}</Text>
            <ChipRow
              accessibilityLabel={q.prompt}
              options={q.options}
              value={picked[q.id] ?? q.default_option}
              onChange={(id) => setPicked((p) => ({ ...p, [q.id]: id }))}
            />
          </View>
        ))}
      </View>
      <Button label={t('common.looksRight')} onPress={confirm} loading={saving} />
    </Sheet>
  );
}
