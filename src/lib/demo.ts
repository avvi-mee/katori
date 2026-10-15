/**
 * Demo mode: EXPO_PUBLIC_DEMO=1 swaps Supabase for an in-browser fake backend (src/features/demo) so the
 * whole app can be tried with no accounts. Never set it in CI or production builds.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';
