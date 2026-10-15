import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { KatoriArt } from '@/components/illustrations/Katori';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useSession } from '@/features/auth/session';
import { uploadPhoto } from '@/features/scan/photo';
import { useScan } from '@/features/scan/store';
import { track } from '@/lib/analytics';
import { ApiError, callFunction, errorCode, errorText, type ApiCode } from '@/lib/api';
import { t, useLocale } from '@/lib/i18n';
import type { DraftResponse } from '@/types/api';

const STATUS = ['scan.status1', 'scan.status2', 'scan.status3', 'scan.status4'] as const;

/** Never a spinner: a shimmer of the result card plus rotating status lines. */
export default function Analyzing() {
  useLocale();
  const uid = useSession((s) => s.session?.user.id);
  const { photo, mealType, hint, startedAt, set } = useScan();
  const [line, setLine] = useState(0);
  const [failed, setFailed] = useState<ApiCode | null>(null);
  const [failText, setFailText] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setLine((n) => (n + 1) % STATUS.length), 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!photo || !uid) return void router.replace('/scan/camera');
    (async () => {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError('NETWORK', 'offline');
        const path = await uploadPhoto(uid, photo.blob).catch(() => {
          throw new ApiError('NETWORK', 'upload failed');
        });
        const draft = await callFunction<DraftResponse>('analyze-meal', {
          image_path: path,
          meal_type: mealType,
          ...(hint.trim() ? { hint_text: hint.trim() } : {}),
        });
        const confidences = draft.items.map((i) => i.confidence);
        track('scan_completed', {
          latency_ms: Date.now() - startedAt,
          items_count: draft.items.length,
          avg_confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
        });
        set({ draft });
        router.replace('/scan/confirm-portions');
      } catch (e) {
        const code = errorCode(e);
        track('scan_failed', { code });
        if (code === 'NEEDS_PRO') return void router.replace('/paywall?from=scan');
        setFailed(code);
        setFailText(errorText(e));
      }
    })();
  }, [photo, uid, mealType, hint, startedAt, set]);

  return (
    <Screen className="gap-5">
      {photo ? (
        <Image
          source={{ uri: photo.url }}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 28 }}
          resizeMode="cover"
          accessibilityLabel="Your meal photo"
        />
      ) : null}

      {failed ? (
        <Card className="items-center gap-3 py-6">
          <KatoriArt size={110} fill={0.1} />
          <Text variant="title" className="text-center">
            {failText}
          </Text>
          <View className="w-full gap-2">
            {failed === 'BAD_IMAGE' || failed === 'AI_UNAVAILABLE' ? (
              <>
                <Button label={t('scan.typeIt')} onPress={() => router.replace('/(tabs)/food?type=1')} />
                <Button label={t('scan.retake')} variant="secondary" onPress={() => router.replace('/scan/camera')} />
              </>
            ) : (
              <>
                <Button
                  label={t('scan.retry')}
                  onPress={() => {
                    ran.current = false;
                    setFailed(null);
                    router.replace('/scan/analyzing');
                  }}
                />
                <Button
                  label={t('scan.typeIt')}
                  variant="secondary"
                  onPress={() => router.replace('/(tabs)/food?type=1')}
                />
              </>
            )}
          </View>
        </Card>
      ) : (
        <>
          <Animated.View
            key={line}
            entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(120)}
            accessibilityLiveRegion="polite"
          >
            <Text variant="title">{t(STATUS[line]!)}</Text>
          </Animated.View>
          <Card className="gap-4">
            <View className="flex-row items-center justify-between">
              <Skeleton width="45%" height={22} />
              <Skeleton width={90} height={28} radius={14} />
            </View>
            {[0, 1, 2].map((i) => (
              <View key={i} className="flex-row items-center gap-3">
                <Skeleton width={44} height={44} radius={22} />
                <View className="flex-1 gap-2">
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="35%" height={12} />
                </View>
                <Skeleton width={48} height={16} />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
