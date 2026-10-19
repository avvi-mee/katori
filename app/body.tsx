import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChevronLeft, Image as ImageIcon } from '@/components/icons';
import { LineChart } from '@/components/LineChart';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { useTheme } from '@/design/theme';
import {
  MEASUREMENTS,
  useBodyActions,
  useBodyLogs,
  usePhotoUrl,
  useWeights,
  type Measurement,
} from '@/features/body/api';
import { istDay } from '@/lib/day';
import { t, useLocale } from '@/lib/i18n';

/** Weight (into `weights`), tape measurements and private progress photos (body_logs + body-photos bucket). */
export default function Body() {
  useLocale();
  const { colors } = useTheme();
  const today = istDay();
  const weights = useWeights();
  const logs = useBodyLogs();
  const actions = useBodyActions();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kg, setKg] = useState('');
  const [tape, setTape] = useState<Partial<Record<Measurement, string>>>({});
  const [uploading, setUploading] = useState(false);
  const todayLog = logs.data?.find((l) => l.date === today);
  const latest = weights.data?.at(-1);
  const photos = (logs.data ?? []).filter((l) => l.photo_path).reverse();
  const kgNum = Number(kg.replace(',', '.'));

  return (
    <Screen className="gap-4">
      <View className="flex-row items-center gap-1">
        <PressableScale
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/me'))}
          accessibilityLabel={t('common.back')}
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
        >
          <ChevronLeft color={colors.ink} size={24} />
        </PressableScale>
        <Text variant="display" accessibilityRole="header">
          {t('body.title')}
        </Text>
      </View>
      <Text variant="body" className="text-ink-muted">
        {t('body.private')}
      </Text>

      <Card className="gap-3" enterIndex={0}>
        <Text variant="heading">{t('body.weight')}</Text>
        {weights.isLoading ? (
          <Skeleton height={120} radius={12} />
        ) : (weights.data?.length ?? 0) >= 2 ? (
          <LineChart
            points={weights.data!.slice(-30).map((w) => ({
              label: new Date(`${w.date}T00:00:00Z`).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }),
              value: w.weight_kg,
            }))}
            unit=" kg"
            accessibilityLabel={t('body.weightTrend')}
          />
        ) : latest ? (
          <Text variant="number">{latest.weight_kg} kg</Text>
        ) : null}
        <View className="flex-row items-end gap-3">
          <View className="flex-1">
            <TextField
              label={t('body.todayWeight')}
              value={kg}
              onChangeText={setKg}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder={latest ? String(latest.weight_kg) : '70.0'}
              suffix="kg"
            />
          </View>
          <Button
            label={t('common.save')}
            size="md"
            className="mb-1"
            disabled={!(kgNum >= 25 && kgNum <= 300)}
            onPress={async () => {
              await actions.logWeight(kgNum, today);
              setKg('');
              toast({ message: t('body.weightSaved'), tone: 'success' });
            }}
          />
        </View>
        <Text variant="caption">{t('body.weightHint')}</Text>
      </Card>

      <Card className="gap-3" enterIndex={1}>
        <Text variant="heading">{t('body.measurements')}</Text>
        <View className="flex-row flex-wrap gap-3">
          {MEASUREMENTS.map((m) => (
            <View key={m} className="min-w-[140px] flex-1">
              <TextField
                label={t(`body.${m}`)}
                value={tape[m] ?? (todayLog?.[m] == null ? '' : String(todayLog[m]))}
                onChangeText={(v) => setTape((s) => ({ ...s, [m]: v }))}
                inputMode="decimal"
                keyboardType="decimal-pad"
                suffix="cm"
              />
            </View>
          ))}
        </View>
        <Button
          label={t('common.save')}
          variant="secondary"
          disabled={!Object.keys(tape).length}
          onPress={async () => {
            const patch = Object.fromEntries(
              Object.entries(tape).map(([k, v]) => [
                k,
                v?.trim() ? Math.round(Number(v.replace(',', '.')) * 10) / 10 : null,
              ]),
            );
            await actions.saveBodyLog(todayLog, patch, today);
            setTape({});
            toast({ message: t('body.saved'), tone: 'success' });
          }}
        />
      </Card>

      <Card className="gap-3" enterIndex={2}>
        <Text variant="heading">{t('body.photos')}</Text>
        <Text variant="caption">{t('body.photosHint')}</Text>
        {photos.length ? (
          <View className="flex-row flex-wrap gap-2">
            {photos.slice(0, 12).map((p) => (
              <Photo key={p.id} path={p.photo_path!} date={p.date} />
            ))}
          </View>
        ) : null}
        {Platform.OS === 'web' ? (
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setUploading(true);
              try {
                const path = await actions.uploadPhoto(f);
                await actions.saveBodyLog(todayLog, { photo_path: path }, today);
                toast({ message: t('body.photoSaved'), tone: 'success' });
              } catch {
                toast({ message: t('body.photoOffline'), tone: 'error' });
              } finally {
                setUploading(false);
              }
            }}
          />
        ) : null}
        <Button
          label={t('body.addPhoto')}
          variant="secondary"
          loading={uploading}
          icon={<ImageIcon color={colors.ink} size={18} />}
          onPress={() => fileRef.current?.click()}
        />
      </Card>
    </Screen>
  );
}

function Photo({ path, date }: { path: string; date: string }) {
  const url = usePhotoUrl(path);
  return (
    <View className="gap-1">
      {url.data ? (
        <Image
          source={{ uri: url.data }}
          style={{ width: 100, height: 130, borderRadius: 12 }}
          accessibilityLabel={date}
        />
      ) : (
        <View className="h-[130px] w-[100px] rounded-input bg-surface-2" />
      )}
      <Text variant="caption">
        {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </Text>
    </View>
  );
}
