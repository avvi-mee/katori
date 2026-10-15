import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { clearPendingScans } from '@/features/scan/pendingScans';
import { clearOutbox } from '@/lib/outbox';
import { persister, queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

type SessionState = { session: Session | null; ready: boolean };

export const useSession = create<SessionState>(() => ({ session: null, ready: false }));

// One listener for the whole app; INITIAL_SESSION fires once the stored session is read.
supabase.auth.onAuthStateChange((_event, session) => {
  useSession.setState({ session, ready: true });
});

/** Sign out and wipe everything cached on this device for the user (shared phones are common). */
export async function signOut() {
  await supabase.auth.signOut();
  queryClient.clear();
  await Promise.all([persister.removeClient(), clearOutbox(), clearPendingScans()]).catch(() => undefined);
}
