import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { istDay } from '@/lib/day';
import { supabase } from '@/lib/supabase';

/** Links point at whichever deployment the user is on (preview or production). */
export const appOrigin = () =>
  typeof window !== 'undefined' && window.location ? window.location.origin : 'https://katori.unmatrix.in';

// ─── Referrals ───────────────────────────────────────────────────────────────
export function useReferral() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['referral', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [{ data: code, error }, { data: rows }] = await Promise.all([
        supabase.rpc('my_referral_code'),
        supabase.from('referrals').select('referrer_id, status').eq('referrer_id', uid!),
      ]);
      if (error) throw error;
      const list = (rows ?? []) as { status: 'pending' | 'rewarded' | 'rejected' }[];
      return {
        code: code as string,
        joined: list.length,
        rewarded: list.filter((r) => r.status === 'rewarded').length,
      };
    },
  });
}

export function useReferralPreview(code: string | undefined) {
  return useQuery({
    queryKey: ['referral_preview', code],
    enabled: !!code,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('referral_preview', { code: code! });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export function useRedeemReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('redeem_referral', { code });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referral'] }),
  });
}

// ─── Challenges ──────────────────────────────────────────────────────────────
export type Challenge = { id: string; name: string; starts_on: string; ends_on: string; invite_code: string };
export type BoardRow = { user_id: string; display_name: string; days_hit: number; days_logged: number; is_me: boolean };

export function useMyChallenges() {
  const uid = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: ['challenges', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, name, starts_on, ends_on, invite_code')
        .order('starts_on', { ascending: false });
      if (error) throw error;
      return data as Challenge[];
    },
  });
}

export function useLeaderboard(id: string | undefined) {
  return useQuery({
    queryKey: ['challenge_board', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('challenge_leaderboard', { cid: id! });
      if (error) throw error;
      return data as BoardRow[];
    },
  });
}

export function useChallengePreview(code: string | undefined) {
  return useQuery({
    queryKey: ['challenge_preview', code],
    enabled: !!code,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('challenge_preview', { code: code! });
      if (error) throw error;
      return ((data as { name: string; starts_on: string; members: number }[] | null) ?? [])[0] ?? null;
    },
  });
}

export function useChallengeActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['challenges'] });
  return {
    create: async (name: string, displayName: string, startsOn = istDay()) => {
      const { data, error } = await supabase.rpc('create_challenge', {
        challenge_name: name,
        start_day: startsOn,
        display_name: displayName,
      });
      if (error) throw error;
      void done();
      return data as string;
    },
    join: async (code: string, displayName: string) => {
      const { data, error } = await supabase.rpc('join_challenge', { code, display_name: displayName });
      if (error) throw error;
      void done();
      return data as string;
    },
    leave: async (id: string) => {
      const { error } = await supabase.rpc('leave_challenge', { cid: id });
      if (error) throw error;
      void done();
    },
  };
}

/** Day n of 30 (clamped), for the challenge header. */
export function challengeDay(c: Pick<Challenge, 'starts_on' | 'ends_on'>, today = istDay()) {
  const n = Math.round((Date.parse(today) - Date.parse(c.starts_on)) / 86_400_000) + 1;
  return { day: Math.max(0, Math.min(30, n)), upcoming: n < 1, over: today > c.ends_on };
}

// ─── Telegram ────────────────────────────────────────────────────────────────
export const TELEGRAM_BOT = process.env.EXPO_PUBLIC_TELEGRAM_BOT ?? '';

export function useTelegramLink() {
  const uid = useSession((s) => s.session?.user.id);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['channel_links', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_links')
        .select('channel, verified_at')
        .eq('channel', 'telegram');
      if (error) throw error;
      return ((data ?? []) as { verified_at: string }[])[0] ?? null;
    },
  });
  return {
    linked: status.data ?? null,
    refresh: () => status.refetch(),
    /** A deep link that opens the bot with a one-time code (valid 15 minutes). */
    makeLink: async () => {
      const { data, error } = await supabase.rpc('create_channel_link_code', { ch: 'telegram' });
      if (error) throw error;
      return `https://t.me/${TELEGRAM_BOT}?start=${data as string}`;
    },
    unlink: async () => {
      await supabase.from('channel_links').delete().eq('channel', 'telegram');
      void qc.invalidateQueries({ queryKey: ['channel_links'] });
    },
  };
}
