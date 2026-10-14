import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { duration, spring } from '@/design/motion';

type Props = ViewProps & { children: ReactNode; className?: string; enterIndex?: number; flex?: boolean };

/** Surface card. Pass enterIndex to stagger it in with the doc's spring. */
export function Card({ children, className, enterIndex, flex, ...rest }: Props) {
  const body = (
    <View
      className={`rounded-card border border-line bg-surface p-4 ${flex ? 'flex-1' : ''} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </View>
  );
  if (enterIndex === undefined) return body;
  return (
    <Animated.View
      style={flex ? { flex: 1 } : undefined}
      entering={FadeInDown.delay(enterIndex * 60)
        .duration(duration.card)
        .springify()
        .damping(spring.damping!)
        .stiffness(spring.stiffness!)
        .reduceMotion(ReduceMotion.System)}
    >
      {body}
    </Animated.View>
  );
}
