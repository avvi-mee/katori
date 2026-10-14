import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/Button';
import { KatoriArt } from '@/components/illustrations/Katori';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { toast } from '@/components/Toast';
import { t, useLocale } from '@/lib/i18n';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const EmailForm = z.object({ email: z.string().trim().email() });
const RESEND_SECONDS = 30;

export default function SignIn() {
  useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const form = useForm<z.infer<typeof EmailForm>>({ resolver: zodResolver(EmailForm), defaultValues: { email: '' } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async (email: string) => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return toast({ message: error.message, tone: 'error' });
    setSentTo(email);
    setCooldown(RESEND_SECONDS);
  };

  const verify = async (token: string) => {
    if (!sentTo || token.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'email' });
    setBusy(false);
    // On success the session listener routes to onboarding or the app.
    if (error) {
      setCode('');
      toast({ message: t('auth.badCode'), tone: 'error' });
    }
  };

  const google = async () => {
    const redirectTo = Platform.OS === 'web' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) toast({ message: error.message, tone: 'error' });
  };

  return (
    <Screen className="justify-center gap-8">
      <View className="items-center gap-3">
        <KatoriArt size={140} />
        <Text variant="hero">Katori</Text>
        <Text variant="body" className="text-center text-ink-muted">
          {t('auth.tagline')}
        </Text>
      </View>

      {!supabaseConfigured ? (
        <View className="rounded-card bg-accent-soft p-4">
          <Text variant="label">{t('auth.notConfigured')}</Text>
        </View>
      ) : null}

      {sentTo ? (
        <View className="gap-4">
          <Text variant="body">{t('auth.codeSent', { email: sentTo })}</Text>
          <TextField
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6) verify(digits);
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            style={{ letterSpacing: 8, fontSize: 22 }}
          />
          <Button label={t('auth.verify')} onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />
          <View className="flex-row justify-between">
            <PressableScale onPress={() => setSentTo(null)} className="min-h-touch justify-center">
              <Text variant="label" className="text-ink-muted">
                {t('auth.changeEmail')}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => cooldown <= 0 && sendCode(sentTo)}
              disabled={cooldown > 0}
              className="min-h-touch justify-center"
            >
              <Text variant="label" className={cooldown > 0 ? 'text-ink-muted' : 'text-ink'}>
                {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resend')}
              </Text>
            </PressableScale>
          </View>
        </View>
      ) : (
        <View className="gap-4">
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label={t('auth.email')}
                placeholder={t('auth.emailPlaceholder')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                onSubmitEditing={form.handleSubmit((v) => sendCode(v.email))}
                error={fieldState.error ? t('auth.invalidEmail') : undefined}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
              />
            )}
          />
          <Button label={t('auth.sendCode')} onPress={form.handleSubmit((v) => sendCode(v.email))} loading={busy} />
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <Text variant="caption">{t('auth.or')}</Text>
            <View className="h-px flex-1 bg-line" />
          </View>
          <Button label={t('auth.google')} variant="secondary" onPress={google} />
        </View>
      )}

      <Text variant="caption" className="text-center">
        {t('auth.terms')}
      </Text>
    </Screen>
  );
}
