import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { t, useLocale } from '@/lib/i18n';

// Placeholder; the food diary lands in step 4.
export default function Food() {
  useLocale();
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('tabs.food')}
      </Text>
    </Screen>
  );
}
