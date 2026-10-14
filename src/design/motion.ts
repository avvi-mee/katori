import { ReduceMotion, useReducedMotion, withSpring, withTiming, type WithSpringConfig } from 'react-native-reanimated';

// From the doc: 120 ms taps, 220 ms cards/sheets, 360 ms screens; spring damping 18, stiffness 220.
export const duration = { tap: 120, card: 220, screen: 360 } as const;
export const spring: WithSpringConfig = { damping: 18, stiffness: 220, reduceMotion: ReduceMotion.System };

export { useReducedMotion };

/** Spring to a value, or jump/fade quickly when the user prefers reduced motion. */
export function animateTo(value: number, reduced: boolean, ms: number = duration.card) {
  'worklet';
  return reduced ? withTiming(value, { duration: Math.min(ms, 80) }) : withSpring(value, spring);
}
