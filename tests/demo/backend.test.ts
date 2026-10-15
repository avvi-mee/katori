import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_CODE, demoFetch, parseMealText, resetDemo } from '@/features/demo/backend';

const client = () =>
  createClient('https://demo.katori.local', 'demo', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: demoFetch },
  });

const errorCode = async (e: unknown) =>
  e instanceof FunctionsHttpError ? ((await e.context.json()) as { error: { code: string } }).error.code : null;

beforeEach(() => resetDemo());

describe('demo backend (through supabase-js)', () => {
  it('signs in with the demo code only', async () => {
    const sb = client();
    expect((await sb.auth.verifyOtp({ email: 'asha@test.dev', token: '000000', type: 'email' })).error).toBeTruthy();
    const { data, error } = await sb.auth.verifyOtp({ email: 'asha@test.dev', token: DEMO_CODE, type: 'email' });
    expect(error).toBeNull();
    expect(data.session?.user.email).toBe('asha@test.dev');
  });

  it('runs the whole food flow: profile → scan → portions → save → diary → quota → Pro', async () => {
    const sb = client();
    await sb.auth.verifyOtp({ email: 'asha@test.dev', token: DEMO_CODE, type: 'email' });

    const profile = await sb.from('profiles').select('*').eq('id', 'x').single();
    expect(profile.data).toMatchObject({ name: 'Asha', onboarded_at: null });
    const updated = await sb
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString(), kcal_target: 1800 })
      .eq('id', 'x')
      .select('*')
      .single();
    expect(updated.data?.kcal_target).toBe(1800);

    const scan = await sb.functions.invoke('analyze-meal', { body: { image_path: 'u/p.jpg', meal_type: 'lunch' } });
    expect(scan.error).toBeNull();
    expect(scan.data.items.length).toBe(4);
    expect(scan.data.questions.length).toBeLessThanOrEqual(3);

    const saved = await sb.functions.invoke('confirm-meal', {
      body: { client_id: crypto.randomUUID(), draft_id: scan.data.draft_id, answers: [] },
    });
    expect(saved.error).toBeNull();
    expect(saved.data.kcal).toBeGreaterThan(300);
    expect(saved.data.kcal_low).toBeLessThan(saved.data.kcal);
    expect(saved.data.coach_message?.text).toBeTruthy();

    const meals = await sb
      .from('meals')
      .select('*')
      .gte('eaten_at', '2000-01-01')
      .lt('eaten_at', '2999-01-01')
      .order('eaten_at');
    expect(meals.data).toHaveLength(1);
    expect(meals.data?.[0]?.meal_items).toHaveLength(4);

    // FREE_SCANS_PER_DAY = 1: the second scan opens the paywall.
    const second = await sb.functions.invoke('analyze-meal', { body: { image_path: 'u/q.jpg', meal_type: 'dinner' } });
    expect(await errorCode(second.error)).toBe('NEEDS_PRO');

    await sb.functions.invoke('create-subscription', { body: { plan: 'yearly' } });
    const sub = await sb.from('subscriptions').select('*').maybeSingle();
    expect(sub.data).toMatchObject({ status: 'active', plan: 'yearly' });
    const third = await sb.functions.invoke('analyze-meal', {
      body: { image_path: 'u/r.jpg', meal_type: 'dinner', hint_text: '150 g paneer bhurji, 2 roti' },
    });
    expect(third.error).toBeNull();
    expect(third.data.items.map((i: { dish: string; unit: string; qty: number }) => [i.dish, i.unit, i.qty])).toEqual([
      ['Paneer Bhurji', 'g', 150],
      ['Roti', 'roti', 2],
    ]);

    const usual = await sb.from('user_dish_defaults').select('*').order('times_used', { ascending: false });
    expect(usual.data?.length).toBe(4);

    await sb.from('meals').delete().eq('id', meals.data![0]!.id);
    expect((await sb.from('meals').select('*')).data).toHaveLength(0);
  });

  it('is idempotent on client_id (offline outbox replays)', async () => {
    const sb = client();
    await sb.auth.verifyOtp({ email: 'a@b.c', token: DEMO_CODE, type: 'email' });
    const body = {
      client_id: crypto.randomUUID(),
      meal_type: 'snack',
      source: 'home',
      items: [{ food_item_id: '00000000-0000-4000-8000-000000000001', unit: 'roti', qty: 2 }],
    };
    await sb.functions.invoke('confirm-meal', { body });
    const again = await sb.functions.invoke('confirm-meal', { body });
    expect(again.data.duplicate).toBe(true);
    expect((await sb.from('meals').select('*')).data).toHaveLength(1);
  });

  it('log-text turns Hinglish text into items', async () => {
    const sb = client();
    await sb.auth.verifyOtp({ email: 'a@b.c', token: DEMO_CODE, type: 'email' });
    const r = await sb.functions.invoke('log-text', { body: { text: '2 roti aur 1 katori dal', meal_type: 'lunch' } });
    expect(r.data.items.map((i: { dish: string; qty: number }) => [i.dish, i.qty])).toEqual([
      ['Roti', 2],
      ['Dal Tadka', 1],
    ]);
  });
});

describe('parseMealText', () => {
  it('splits on aur/and/commas and reads quantities', () => {
    expect(parseMealText('3 idli, sambar and 1 glass chaas').map((i) => [i.dish, i.qty])).toEqual([
      ['Idli', 3],
      ['Sambar', 1],
      ['Chaas', 1],
    ]);
  });
});
