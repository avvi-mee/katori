import { router } from 'expo-router';
import { View } from 'react-native';

import { KatoriArt } from '@/components/illustrations/Katori';
import { PlateArt } from '@/components/illustrations/Plate';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { useOnboarding } from '@/features/auth/onboarding';
import { OnboardingShell } from '@/features/auth/OnboardingShell';
import { track } from '@/lib/analytics';
import { t, useLocale } from '@/lib/i18n';

// From the doc: small ~100 ml, medium ~150 ml, large ~200 ml.
const KATORIS = [
  { id: 'small', ml: 100, art: 0.72 },
  { id: 'medium', ml: 150, art: 0.86 },
  { id: 'large', ml: 200, art: 1 },
] as const;
const PLATES = [
  { id: 'small', inch: 9, art: 0.7 },
  { id: 'medium', inch: 11, art: 0.85 },
  { id: 'large', inch: 12.5, art: 1 },
] as const;

function PictureChoice(props: {
  label: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="radio"
      aria-checked={props.selected}
      accessibilityLabel={`${props.label}, ${props.caption}`}
      pressedScale={0.96}
      className={`flex-1 items-center justify-end gap-1 rounded-card border-2 px-1 pb-3 pt-4 ${
        props.selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
      }`}
    >
      <View className="h-[84px] items-center justify-end">{props.children}</View>
      <Text variant="label">{props.label}</Text>
      <Text variant="caption">{props.caption}</Text>
    </PressableScale>
  );
}

export default function CalibrationStep() {
  useLocale();
  const { katori_ml, plate_size, set } = useOnboarding();

  return (
    <OnboardingShell
      step="katori-calibration"
      title={t('onb.calib.title')}
      subtitle={t('onb.calib.body')}
      cta={{
        label: t('common.continue'),
        onPress: () => {
          track('onboarding_step', { step: 'katori-calibration' });
          router.push('/coach-picker');
        },
      }}
    >
      <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('onb.calib.title')}>
        {KATORIS.map((k) => (
          <PictureChoice
            key={k.id}
            label={t(`calib.${k.id}`)}
            caption={`~${k.ml} ml`}
            selected={katori_ml === k.ml}
            onPress={() => set({ katori_ml: k.ml })}
          >
            <KatoriArt size={104 * k.art} fill={0.75} />
          </PictureChoice>
        ))}
      </View>
      <Text variant="heading" className="mt-6">
        {t('onb.calib.plate')}
      </Text>
      <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('onb.calib.plate')}>
        {PLATES.map((p) => (
          <PictureChoice
            key={p.id}
            label={t(`calib.${p.id}`)}
            caption={`~${p.inch}″`}
            selected={plate_size === p.id}
            onPress={() => set({ plate_size: p.id })}
          >
            <PlateArt size={84} scale={p.art} />
          </PictureChoice>
        ))}
      </View>
    </OnboardingShell>
  );
}
