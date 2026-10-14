import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type SessionState = { session: Session | null; ready: boolean };

export const useSession = create<SessionState>(() => ({ session: null, ready: false }));

// One listener for the whole app; INITIAL_SESSION fires once the stored session is read.
supabase.auth.onAuthStateChange((_event, session) => {
  useSession.setState({ session, ready: true });
});

export const signOut = () => supabase.auth.signOut();
