// Typed product events from docs/ARCHITECTURE.md "Observability and KPIs", sent to PostHog.
// PostHog loads after first paint (dynamic import) so it never weighs on startup; events fired before
// that are queued. No autocapture and no session recording: only these explicit events, no free text.
type PostHog = (typeof import('posthog-js'))['default'];

export type AnalyticsEvent =
  | { name: 'onboarding_step'; props: { step: string; goal?: string; diet_type?: string } }
  | { name: 'scan_started'; props: Record<string, never> }
  | { name: 'scan_completed'; props: { latency_ms: number; items_count: number; avg_confidence: number } }
  | { name: 'scan_failed'; props: { code: string } }
  | { name: 'item_edited'; props: { field: string; from: string; to: string } }
  | { name: 'meal_saved'; props: { input_mode: string; kcal: number } }
  | {
      name: 'paywall_viewed' | 'checkout_started' | 'subscribed';
      props: { plan?: string; price?: number; source_screen: string };
    }
  | { name: 'pwa_installed'; props: { platform: string } };

let ph: PostHog | null = null;
let started = false;
let pendingUser: string | null | undefined;
const queue: [string, Record<string, unknown>][] = [];

export async function initAnalytics() {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (started || !key || typeof window === 'undefined') return;
  started = true;
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: 'history_change',
    disable_session_recording: true,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
  });
  ph = posthog;
  if (pendingUser) ph.identify(pendingUser);
  for (const [name, props] of queue.splice(0)) ph.capture(name, props);
}

export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']): void {
  if (__DEV__) console.debug('[track]', name, props);
  if (ph) ph.capture(name, props);
  else if (queue.length < 100) queue.push([name, props]);
}

/** Identify by the opaque user id only (never email or name). null on sign-out. */
export function identify(userId: string | null) {
  pendingUser = userId;
  if (!ph) return;
  if (userId) ph.identify(userId);
  else ph.reset();
}
