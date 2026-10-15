import { createClient } from '@supabase/supabase-js';

import { isDemo } from './demo';

// Public values: the anon key is designed to ship in the client; RLS protects every row.
const url = isDemo ? 'https://demo.katori.local' : (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
const anonKey = isDemo ? 'demo' : (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');

/** False when .env is missing; the sign-in screen explains how to configure it. */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  // Demo mode answers every request in the browser; the module only loads when the flag is on.
  ...(isDemo
    ? {
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            import('@/features/demo/backend').then((m) => m.demoFetch(input, init)),
        },
      }
    : {}),
});
