import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeOutDown, ReduceMotion, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { spring } from '@/design/motion';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type ToastData = {
  id: number;
  message: string;
  tone?: 'default' | 'error' | 'success';
  action?: { label: string; onPress: () => void };
};

export const useToast = create<{
  current: ToastData | null;
  show: (t: Omit<ToastData, 'id'>) => void;
  hide: () => void;
}>((set) => ({
  current: null,
  show: (t) => set({ current: { ...t, id: Date.now() } }),
  hide: () => set({ current: null }),
}));

/** `toast({ message, action })` from anywhere; one toast at a time. */
export const toast = (t: Omit<ToastData, 'id'>) => useToast.getState().show(t);

const dot = { default: 'bg-ink-muted', error: 'bg-fat', success: 'bg-protein' } as const;

export function ToastHost() {
  const current = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    const id = setTimeout(hide, current.action ? 5000 : 3000);
    return () => clearTimeout(id);
  }, [current, hide]);

  if (!current) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 88 }}>
      <Animated.View
        key={current.id}
        entering={SlideInDown.springify()
          .damping(spring.damping!)
          .stiffness(spring.stiffness!)
          .reduceMotion(ReduceMotion.System)}
        exiting={FadeOutDown.reduceMotion(ReduceMotion.System)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <View className="mx-auto w-full max-w-[520px] flex-row items-center gap-3 rounded-card bg-ink py-2 pl-4 pr-2">
          <View className={`h-2 w-2 rounded-full ${dot[current.tone ?? 'default']}`} />
          <Text variant="label" className="flex-1 py-2 text-bg">
            {current.message}
          </Text>
          {current.action ? (
            <PressableScale
              onPress={() => {
                current.action!.onPress();
                hide();
              }}
              className="min-h-touch justify-center rounded-full px-3"
            >
              <Text variant="label" className="font-sans-bold text-bg underline">
                {current.action.label}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}
