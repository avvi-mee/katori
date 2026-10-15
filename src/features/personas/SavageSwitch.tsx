import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { Text } from '@/components/Text';
import { t } from '@/lib/i18n';

type Props = {
  value: boolean;
  adultConfirmed: boolean;
  onChange: (patch: { savage_mode: boolean; adult_confirmed?: boolean }) => void;
};

/** Savage mode is off by default and needs an explicit 18+ confirmation before it turns on. */
export function SavageSwitch({ value, adultConfirmed, onChange }: Props) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Switch
        label={t('onb.coach.savage')}
        description={t('onb.coach.savageDesc')}
        value={value}
        onChange={(on) => {
          if (!on) onChange({ savage_mode: false });
          else if (adultConfirmed) onChange({ savage_mode: true });
          else setAsk(true);
        }}
      />
      <Sheet open={ask} onClose={() => setAsk(false)} title={t('onb.coach.adultTitle')}>
        <Text variant="body" className="mb-6 text-ink-muted">
          {t('onb.coach.adultBody')}
        </Text>
        <View className="gap-2">
          <Button
            label={t('onb.coach.adultYes')}
            onPress={() => {
              onChange({ savage_mode: true, adult_confirmed: true });
              setAsk(false);
            }}
          />
          <Button label={t('onb.coach.adultNo')} variant="ghost" onPress={() => setAsk(false)} />
        </View>
      </Sheet>
    </>
  );
}
