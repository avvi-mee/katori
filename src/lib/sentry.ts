// Front-end error tracking. Loaded after first paint (dynamic import) to keep startup light.
// shortcut: web SDK only; Phase 4 native builds switch to @sentry/react-native.
type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;
let pendingUser: string | null = null;

export async function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (sentry || !dsn || __DEV__ || typeof window === 'undefined') return;
  const S = await import('@sentry/react');
  S.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Meal text and photos never go to Sentry: drop breadcrumb payloads from console and fetch bodies.
    beforeBreadcrumb: (b) => (b.category === 'console' ? null : b),
  });
  sentry = S;
  if (pendingUser) S.setUser({ id: pendingUser });
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (__DEV__) console.error(error);
  sentry?.captureException(error, extra ? { extra } : undefined);
}

export function setErrorUser(userId: string | null) {
  pendingUser = userId;
  sentry?.setUser(userId ? { id: userId } : null);
}
