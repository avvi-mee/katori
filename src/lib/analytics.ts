// Typed product events from docs/ARCHITECTURE.md "Observability and KPIs".
// shortcut: no-op until PostHog is wired in Phase 1A step 10; call sites stay the same.
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

export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']): void {
  if (__DEV__) console.debug('[track]', name, props);
}
