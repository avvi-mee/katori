import { Share, SquarePlus } from '@/components/icons';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { KatoriArt } from '@/components/illustrations/Katori';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { acceptInstall, dismissInstall, useInstall } from './pwa';

/** Custom install prompt (Android) or "Add to Home Screen" guide (iPhone Safari). */
export function InstallSheet() {
  const { colors } = useTheme();
  const offer = useInstall((s) => s.offer);
  return (
    <Sheet open={!!offer} onClose={dismissInstall} title={t('install.title')}>
      <View className="items-center gap-3">
        <KatoriArt size={110} />
        <Text variant="body" className="text-center text-ink-muted">
          {t('install.body')}
        </Text>
        {offer === 'ios' ? (
          <View className="w-full gap-3 rounded-card bg-surface-2 p-4">
            <View className="flex-row items-center gap-3">
              <Share color={colors.ink} size={22} />
              <Text variant="label" className="flex-1">
                {t('install.ios1')}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <SquarePlus color={colors.ink} size={22} />
              <Text variant="label" className="flex-1">
                {t('install.ios2')}
              </Text>
            </View>
          </View>
        ) : null}
        <View className="w-full gap-2">
          {offer === 'android' ? <Button label={t('install.cta')} onPress={acceptInstall} /> : null}
          <Button
            label={offer === 'ios' ? t('common.close') : t('install.later')}
            variant="ghost"
            onPress={dismissInstall}
          />
        </View>
      </View>
    </Sheet>
  );
}
