import { Tabs } from 'expo-router';

import { Fab } from '@/components/Fab';
import { TabBar } from '@/components/TabBar';
import { useLocale } from '@/lib/i18n';

// Train tab joins in Phase 1B (Build decisions: hidden until then).
export default function TabsLayout() {
  useLocale();
  return (
    <>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="food" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="me" />
      </Tabs>
      <Fab />
    </>
  );
}
