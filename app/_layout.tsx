import '../global.css';

import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';
import { ToastHost } from '@/components/Toast';
import { ThemeProvider, useTheme } from '@/design/theme';
import { useLiveEntitlement } from '@/features/billing/entitlement';
import { ProCelebration } from '@/features/billing/ProCelebration';
import { useProfile } from '@/features/auth/profile';
import { useSession } from '@/features/auth/session';
import { setLocale } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2 } } });

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { scheme, colors } = useTheme();
  const { session, ready } = useSession();
  const profile = useProfile();
  const signedIn = !!session;
  const onboarded = !!profile.data?.onboarded_at;

  useEffect(() => {
    if (profile.data?.locale) setLocale(profile.data.locale);
  }, [profile.data?.locale]);

  const loading = !ready || (signedIn && profile.isPending);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {loading ? (
        <BootSkeleton />
      ) : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !onboarded}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
          <Stack.Screen name="dev/components" />
        </Stack>
      )}
      {signedIn && onboarded ? <EntitlementWatcher /> : null}
      <ToastHost />
    </>
  );
}

/** Keeps the subscription row live (Realtime) and celebrates the moment Pro activates. */
function EntitlementWatcher() {
  useLiveEntitlement();
  return <ProCelebration />;
}

/** Shown while the stored session and profile load. Never a spinner. */
function BootSkeleton() {
  return (
    <View className="mx-auto w-full max-w-[560px] flex-1 gap-4 px-4 pt-16" accessibilityLabel="Loading">
      <Skeleton width="45%" height={34} />
      <Skeleton height={220} radius={28} />
      <Skeleton height={72} radius={20} />
      <Skeleton height={72} radius={20} />
    </View>
  );
}
