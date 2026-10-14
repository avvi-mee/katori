import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { useProfile } from '@/features/auth/profile';
import { t, useLocale } from '@/lib/i18n';

// Placeholder Today screen; the full home (ring, macros, timeline, FAB) lands in step 7.
export default function Today() {
  useLocale();
  const { data: profile } = useProfile();
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header" className="mb-4">
        {t('tabs.today')}
      </Text>
      <Card>
        <EmptyState
          title={t('empty.meals.title')}
          body={
            profile?.kcal_target
              ? `Target: ${profile.kcal_target} kcal · ${profile.protein_target} g protein`
              : t('empty.meals.body')
          }
          action={{
            label: t('empty.meals.action'),
            onPress: () => toast({ message: 'Scanning arrives in the next step.' }),
          }}
        />
      </Card>
    </Screen>
  );
}
