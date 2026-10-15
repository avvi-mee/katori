import { create } from 'zustand';

import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

// shortcut: web/PWA only. Phase 4 native builds use expo-notifications and store installs instead.
const isWeb = typeof window !== 'undefined' && typeof navigator !== 'undefined';

export const isStandalone = () =>
  isWeb &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true);
export const isIOS = () => isWeb && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Production builds only: the service worker precaches the shell so the app opens offline. */
export function registerServiceWorker() {
  if (!isWeb || __DEV__ || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker registration failed', e));
}

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export const useInstall = create<{ deferred: DeferredPrompt | null; offer: 'android' | 'ios' | null }>(() => ({
  deferred: null,
  offer: null,
}));

const DISMISS_KEY = 'katori-install-dismissed';
const recentlyDismissed = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 14 * 86_400_000;
  } catch {
    return false;
  }
};

if (isWeb) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own prompt after the first successful scan
    useInstall.setState({ deferred: e as DeferredPrompt });
  });
  window.addEventListener('appinstalled', () => {
    track('pwa_installed', { platform: isIOS() ? 'ios' : 'android' });
    useInstall.setState({ deferred: null, offer: null });
  });
}

/** Called after the first successful scan: Android gets the install prompt, iPhone gets the guide sheet. */
export function maybeOfferInstall() {
  if (!isWeb || isStandalone() || recentlyDismissed()) return;
  if (useInstall.getState().deferred) useInstall.setState({ offer: 'android' });
  else if (isIOS()) useInstall.setState({ offer: 'ios' });
}

export async function acceptInstall() {
  const deferred = useInstall.getState().deferred;
  useInstall.setState({ offer: null });
  if (!deferred) return;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === 'accepted') track('pwa_installed', { platform: 'android' });
  useInstall.setState({ deferred: null });
}

export function dismissInstall() {
  useInstall.setState({ offer: null });
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

// ─── Web push ────────────────────────────────────────────────────────────────
export const pushSupported = () =>
  isWeb && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const VAPID = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

export type PushResult = 'enabled' | 'denied' | 'unsupported' | 'needs-install';

/** Ask permission, subscribe this device and store the subscription for the 9 pm digest. */
export async function enablePush(uid: string): Promise<PushResult> {
  if (isIOS() && !isStandalone()) return 'needs-install'; // iOS only allows web push from the home screen
  if (!pushSupported() || !VAPID) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
    }));
  const json = sub.toJSON();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: uid, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      { onConflict: 'endpoint' },
    );
  if (error) throw error;
  return 'enabled';
}

export async function disablePush() {
  const reg = pushSupported() ? await navigator.serviceWorker.getRegistration() : undefined;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
