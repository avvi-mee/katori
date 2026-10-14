import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { t, useLocale } from '@/lib/i18n';

// Placeholder; 7-day bars, protein streak and the report card land in step 7.
export default function Progress() {
  useLocale();
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('tabs.progress')}
      </Text>
    </Screen>
  );
}
