import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { fonts } from '@/design/tokens';
import { useTheme } from '@/design/theme';

import { Text } from './Text';

type Props = TextInputProps & { label: string; error?: string; suffix?: string };

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, suffix, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Text variant="label">{label}</Text>
      <View
        className={`min-h-[52px] flex-row items-center rounded-input border-2 bg-surface px-4 ${error ? 'border-fat' : 'border-line'}`}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          aria-invalid={!!error}
          placeholderTextColor={colors.inkMuted}
          style={[
            {
              flex: 1,
              minHeight: 48,
              fontFamily: fonts.sansSemibold,
              fontSize: 17,
              color: colors.ink,
              outlineStyle: 'none',
            } as object,
            { fontVariant: ['tabular-nums'] },
            style,
          ]}
          {...rest}
        />
        {suffix ? (
          <Text variant="label" className="text-ink-muted">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" className="text-fat" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
