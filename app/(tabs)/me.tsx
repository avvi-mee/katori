import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { signOut } from '@/features/auth/session';
import { useProfile } from '@/features/auth/profile';
import { t, useLocale } from '@/lib/i18n';

// Placeholder; persona, calibration, plan and delete account land in steps 7–8.
export default function Me() {
  useLocale();
  const { data: profile } = useProfile();
  return (
    <Screen className="gap-4">
      <Text variant="display" accessibilityRole="header">
        {t('tabs.me')}
      </Text>
      {profile?.name ? <Text variant="heading">{profile.name}</Text> : null}
      <Button label={t('me.signOut')} variant="secondary" onPress={signOut} />
    </Screen>
  );
}
