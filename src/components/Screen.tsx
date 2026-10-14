import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { children: ReactNode; scroll?: boolean; className?: string };

/** Page shell: safe areas, paper background, centred column on wide screens. */
export function Screen({ children, scroll = true, className }: Props) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      className={`mx-auto w-full max-w-[560px] flex-1 px-4 ${className ?? ''}`}
      style={{ paddingTop: insets.top + 12 }}
    >
      {children}
    </View>
  );
  if (!scroll) return <View className="flex-1 bg-bg">{inner}</View>;
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 120 }}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  );
}
