import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import { useSession } from '@/features/auth/session';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

export type Subscription = {
  provider: 'razorpay' | 'dodo' | 'play' | 'appstore';
  plan: 'monthly' | 'yearly';
  status: 'created' | 'active' | 'halted' | 'cancelled' | 'expired';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export const isActive = (s: Subscription | null | undefined, now = Date.now()) =>
  !!s && s.status === 'active' && (!s.current_period_end || Date.parse(s.current_period_end) > now);

/** Shows the Pro celebration once when the subscription flips to active. */
export const useCelebration = create<{ show: boolean; set: (v: boolean) => void }>((set) => ({
  show: false,
  set: (show) => set({ show }),
}));

/** The single "is this user Pro" hook, whatever the provider. Safe to call from any screen. */
export function useEntitlement() {
  const uid = useSession((s) => s.session?.user.id);
  const query = useQuery({
    queryKey: ['subscription', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('provider, plan, status, current_period_end, cancel_at_period_end')
        .maybeSingle();
      if (error) throw error;
      return (data as Subscription | null) ?? null;
    },
  });
  return { isPro: isActive(query.data), subscription: query.data ?? null, loading: query.isPending };
}

/**
 * Mounted once at the app root: listens to the user's subscriptions row over Supabase Realtime, so Pro
 * unlocks the moment the payment webhook lands (even mid-checkout), and celebrates the switch.
 * Only one subscriber may own the channel; supabase-js rejects listeners added after subscribe().
 */
export function useLiveEntitlement() {
  const uid = useSession((s) => s.session?.user.id);
  const qc = useQueryClient();
  const { isPro, subscription, loading } = useEntitlement();
  const wasActive = useRef<boolean | null>(null);

  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`subscription-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ['subscription', uid] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, qc]);

  useEffect(() => {
    if (loading) return;
    if (wasActive.current === false && isPro) {
      track('subscribed', { plan: subscription?.plan, source_screen: 'realtime' });
      useCelebration.getState().set(true);
    }
    wasActive.current = isPro;
  }, [isPro, loading, subscription?.plan]);
}
