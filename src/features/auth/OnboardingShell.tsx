import { router } from 'expo-router';
import { ChevronLeft } from '@/components/icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/design/theme';
import { t } from '@/lib/i18n';

import { ONBOARDING_STEPS } from './onboarding';

type Props = {
  step: (typeof ONBOARDING_STEPS)[number];
  title: string;
  subtitle?: string;
  children: ReactNode;
  cta?: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };
  footer?: ReactNode;
};

/** Progress, back, title and a bottom CTA for each onboarding step. */
export function OnboardingShell({ step, title, subtitle, children, cta, footer }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const index = ONBOARDING_STEPS.indexOf(step);
  const total = ONBOARDING_STEPS.length - 1;

  return (
    <View className="flex-1 bg-bg">
      <Screen>
        <View className="mb-6 flex-row items-center gap-2">
          <PressableScale
            onPress={() => (router.canGoBack() ? router.back() : null)}
            accessibilityLabel={t('common.back')}
            className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
          >
            <ChevronLeft color={colors.ink} size={26} />
          </PressableScale>
          <View
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
            accessibilityRole="progressbar"
            accessibilityLabel={t('onb.step', { n: index, total })}
          >
            <View className="h-full rounded-full bg-accent" style={{ width: `${(index / total) * 100}%` }} />
          </View>
        </View>
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" className="mt-2 text-ink-muted">
            {subtitle}
          </Text>
        ) : null}
        <View className="mt-6 gap-3">{children}</View>
      </Screen>
      {cta || footer ? (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-line bg-bg px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="mx-auto w-full max-w-[560px] gap-2">
            {cta ? (
              <Button label={cta.label} onPress={cta.onPress} disabled={cta.disabled} loading={cta.loading} />
            ) : null}
            {footer}
          </View>
        </View>
      ) : null}
    </View>
  );
}
