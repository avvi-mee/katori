import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  /** Use "radio" inside single-choice lists (the default). */
  role?: 'radio' | 'button';
  className?: string;
  children?: ReactNode;
};

/** Big tappable choice card used across onboarding and settings. */
export function OptionCard({ title, subtitle, selected, onPress, icon, role = 'radio', className, children }: Props) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={role}
      aria-checked={role === 'radio' ? selected : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      pressedScale={0.98}
      className={`min-h-[64px] flex-row items-center gap-3 rounded-card border-2 px-4 py-3 ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
      } ${className ?? ''}`}
    >
      {icon ? <View className="h-10 w-10 items-center justify-center">{icon}</View> : null}
      <View className="flex-1 gap-0.5">
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
        {children}
      </View>
      <View
        className={`h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? 'border-accent bg-accent' : 'border-line'}`}
      >
        {selected ? <View className="h-2.5 w-2.5 rounded-full bg-surface" /> : null}
      </View>
    </PressableScale>
  );
}
