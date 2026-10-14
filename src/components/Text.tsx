import { Text as RNText, type TextProps } from 'react-native';

import { textClass, type TextVariant } from '@/design/typography';

type Props = TextProps & { variant?: TextVariant; className?: string };

/** All app text. Tabular numbers everywhere so counters never jiggle. */
export function Text({ variant = 'body', className, style, ...rest }: Props) {
  return (
    <RNText className={textClass(variant, className)} style={[{ fontVariant: ['tabular-nums'] }, style]} {...rest} />
  );
}
