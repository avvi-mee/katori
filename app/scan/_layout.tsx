import { Stack } from 'expo-router';

import { useTheme } from '@/design/theme';

export default function ScanLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }} />
  );
}
