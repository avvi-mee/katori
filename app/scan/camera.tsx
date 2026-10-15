import { router } from 'expo-router';
import { Image as ImageIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { ChipRow } from '@/components/ChipRow';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { toast } from '@/components/Toast';
import { fonts } from '@/design/tokens';
import { useReducedMotion } from '@/design/motion';
import { MEAL_ORDER } from '@/features/meals/format';
import { compressPhoto } from '@/features/scan/photo';
import { useScan } from '@/features/scan/store';
import { track } from '@/lib/analytics';
import { t, useLocale, type MessageKey } from '@/lib/i18n';
import type { MealType } from '@/types/meal';

// shortcut: web camera (getUserMedia). Phase 4 native builds swap in expo-camera.
export default function Camera() {
  useLocale();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { mealType, hint, set, reset } = useScan();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  useEffect(() => {
    reset();
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().then(() => setLive(true));
        }
      })
      .catch(() => setLive(false));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [reset]);

  const usePhoto = async (blob: Blob) => {
    setBusy(true);
    try {
      const small = await compressPhoto(blob);
      set({ photo: { blob: small, url: URL.createObjectURL(small) }, startedAt: Date.now() });
      track('scan_started', {});
      router.replace('/scan/analyzing');
    } catch {
      toast({ message: t('err.generic'), tone: 'error' });
      setBusy(false);
    }
  };

  const shoot = async () => {
    const video = videoRef.current;
    if (!live || !video || busy) return fileRef.current?.click();
    navigator.vibrate?.(30);
    if (!reduced) flash.value = withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 220 }));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((b) => b && usePhoto(b), 'image/jpeg', 0.92);
  };

  return (
    <View className="flex-1 bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) usePhoto(f);
          e.target.value = '';
        }}
      />

      {/* Plate guide */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width="82%" height="82%" viewBox="0 0 100 100" style={{ maxWidth: 420, maxHeight: 420 }}>
          <Circle
            cx="50"
            cy="50"
            r="46"
            stroke="#FFFFFF"
            strokeOpacity={0.85}
            strokeWidth="0.8"
            strokeDasharray="3 3"
            fill="none"
          />
        </Svg>
        <Text variant="label" className="mt-2 text-center" style={{ color: '#FFFFFF' }}>
          {live ? t('scan.guide') : t('scan.noCamera')}
        </Text>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', inset: 0, backgroundColor: '#FFFFFF' }, flashStyle]}
      />

      {/* Top bar */}
      <View className="absolute left-0 right-0 flex-row items-center gap-3 px-4" style={{ top: insets.top + 12 }}>
        <PressableScale
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityLabel={t('scan.close')}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <X color="#FFFFFF" size={24} />
        </PressableScale>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
          <ChipRow
            wrap={false}
            accessibilityLabel={t('food.mealType')}
            options={MEAL_ORDER.map((id) => ({ id, label: t(`meal.${id}` as MessageKey) }))}
            value={mealType}
            onChange={(id) => set({ mealType: id as MealType })}
          />
        </ScrollView>
      </View>

      {/* Bottom controls */}
      <View className="absolute left-0 right-0 gap-4 px-4" style={{ bottom: insets.bottom + 20 }}>
        <TextInput
          value={hint}
          onChangeText={(v) => set({ hint: v.slice(0, 200) })}
          placeholder={t('scan.hint')}
          placeholderTextColor="rgba(255,255,255,0.7)"
          accessibilityLabel={t('scan.hint')}
          style={
            {
              minHeight: 48,
              borderRadius: 12,
              paddingHorizontal: 16,
              backgroundColor: 'rgba(0,0,0,0.45)',
              color: '#FFFFFF',
              fontFamily: fonts.sansSemibold,
              fontSize: 15,
              outlineStyle: 'none',
            } as object
          }
        />
        <View className="flex-row items-center justify-between">
          <PressableScale
            onPress={() => fileRef.current?.click()}
            accessibilityLabel={t('scan.gallery')}
            className="h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <ImageIcon color="#FFFFFF" size={24} />
          </PressableScale>
          <PressableScale
            onPress={shoot}
            disabled={busy}
            accessibilityLabel={live ? t('scan.shutter') : t('scan.pickPhoto')}
            pressedScale={0.94}
            className="h-20 w-20 items-center justify-center rounded-full border-4"
            style={{ borderColor: '#FFFFFF', opacity: busy ? 0.5 : 1 }}
          >
            <View className="h-16 w-16 rounded-full bg-accent" />
          </PressableScale>
          <PressableScale
            onPress={() => router.replace('/(tabs)/food?type=1')}
            accessibilityLabel={t('scan.typeInstead')}
            className="h-14 min-w-14 items-center justify-center rounded-full px-3"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <Text variant="caption" style={{ color: '#FFFFFF' }} className="font-sans-bold">
              Aa
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
