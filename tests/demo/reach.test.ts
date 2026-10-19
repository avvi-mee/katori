import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_CODE, demoFetch, resetDemo } from '@/features/demo/backend';

beforeEach(() => resetDemo());

describe('demo backend: reach', () => {
  it('serves a referral code, challenges with a leaderboard, and a Telegram link', async () => {
    const sb = createClient('https://demo.katori.local', 'demo', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: demoFetch },
    });
    await sb.auth.verifyOtp({ email: 'riya@test.dev', token: DEMO_CODE, type: 'email' });

    expect((await sb.rpc('my_referral_code')).data).toMatch(/^[A-Z0-9]{8}$/);
    expect((await sb.rpc('referral_preview', { code: 'friend23' })).data).toBe('Riya');

    const id = (
      await sb.rpc('create_challenge', {
        challenge_name: 'Office protein',
        start_day: '2026-10-20',
        display_name: 'Me',
      })
    ).data as string;
    expect((await sb.from('challenges').select('*')).data).toHaveLength(1);
    const board = (await sb.rpc('challenge_leaderboard', { cid: id })).data as {
      display_name: string;
      is_me: boolean;
    }[];
    expect(board).toHaveLength(4);
    expect(board.filter((r) => r.is_me)).toHaveLength(1);
    await sb.rpc('leave_challenge', { cid: id });
    expect((await sb.from('challenges').select('*')).data).toEqual([]);

    expect((await sb.from('channel_links').select('*')).data).toEqual([]);
    expect((await sb.rpc('create_channel_link_code', { ch: 'telegram' })).data).toBe('TGLINK23');
    expect((await sb.from('channel_links').select('*')).data).toHaveLength(1);
    await sb.from('channel_links').delete().eq('channel', 'telegram');
    expect((await sb.from('channel_links').select('*')).data).toEqual([]);
  });
});
