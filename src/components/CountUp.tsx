import { useEffect, useRef, useState } from 'react';
import { type TextProps } from 'react-native';

import { useReducedMotion } from '@/design/motion';
import type { TextVariant } from '@/design/typography';

import { Text } from './Text';

type Props = TextProps & {
  value: number;
  duration?: number;
  variant?: TextVariant;
  className?: string;
  format?: (n: number) => string;
};

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Counts from the previous value to the new one (ease-out). Instant under reduced motion. */
export function CountUp({ value, duration = 700, format = defaultFormat, ...rest }: Props) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(shown);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const v = a + (value - a) * (1 - (1 - t) ** 3);
      setShown(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return (
    <Text accessibilityLabel={format(value)} {...rest}>
      {format(shown)}
    </Text>
  );
}
