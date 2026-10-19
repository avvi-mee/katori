import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_CODE, demoFetch, resetDemo } from '@/features/demo/backend';

const client = async () => {
  const sb = createClient('https://demo.katori.local', 'demo', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: demoFetch },
  });
  await sb.auth.verifyOtp({ email: 'vikram@test.dev', token: DEMO_CODE, type: 'email' });
  return sb;
};

beforeEach(() => resetDemo());

describe('demo backend: trainer mode', () => {
  it('becoming a coach seeds two clients whose data is served only on request', async () => {
    const sb = await client();
    expect((await sb.rpc('become_coach', { display_name: 'Coach Vikram' })).error).toBeNull();
    const me = (await sb.from('profiles').select('*').eq('id', 'x').single()).data!;
    expect(me).toMatchObject({ role: 'coach', name: 'Coach Vikram' });
    expect(me.onboarded_at).toBeTruthy();

    const links = (await sb.from('coach_clients').select('id, client_id').eq('status', 'active')).data!;
    expect(links).toHaveLength(2);
    const ids = links.map((l) => l.client_id as string);
    const profiles = (await sb.from('profiles').select('*').in('id', ids)).data!;
    expect(profiles.map((p) => p.name).sort()).toEqual(['Asha Verma', 'Rohan Mehta']);
    const meals = (await sb.from('meals').select('id, user_id').in('user_id', ids)).data!;
    expect(meals.length).toBeGreaterThan(10);
    // The coach's own diary stays empty.
    expect((await sb.from('meals').select('id')).data).toEqual([]);
    expect((await sb.from('workouts').select('id')).data).toEqual([]);

    const mealId = meals[0]!.id as string;
    const review = await sb.from('meals').select('*').eq('id', mealId).maybeSingle();
    expect(review.data?.id).toBe(mealId);
    await sb.functions.invoke('coach-comment', { body: { meal_id: mealId, reaction: 'protein' } });
    expect((await sb.from('meal_comments').select('*').in('meal_id', [mealId])).data).toHaveLength(1);

    await sb
      .from('goals')
      .upsert({ user_id: ids[0], kcal: 1800, protein_g: 110, updated_by: 'coach' }, { onConflict: 'user_id' });
    expect((await sb.from('goals').select('*').in('user_id', ids)).data).toHaveLength(1);
    expect((await sb.from('goals').select('*')).data).toEqual([]);
  });

  it('a client accepts an invite, gets a first review, and can leave', async () => {
    const sb = await client();
    expect((await sb.rpc('coach_invite_preview', { code: 'DEMO2345' })).data).toEqual([
      { coach_name: 'Coach Vikram (demo)', valid: true },
    ]);
    await sb.functions.invoke('confirm-meal', {
      body: {
        client_id: crypto.randomUUID(),
        meal_type: 'lunch',
        source: 'home',
        items: [
          { food_item_id: (await sb.from('food_items').select('id').limit(1)).data![0]!.id, unit: 'katori', qty: 1 },
        ],
      },
    });
    await sb.rpc('accept_coach_invite', { code: 'DEMO2345' });
    const coach = (await sb.rpc('my_coach')).data as { link_id: string; coach_name: string }[];
    expect(coach[0]?.coach_name).toBe('Coach Vikram (demo)');
    const mine = (await sb.from('meals').select('id')).data!;
    const comments = (
      await sb
        .from('meal_comments')
        .select('*')
        .in(
          'meal_id',
          mine.map((m) => m.id),
        )
    ).data!;
    expect(comments).toHaveLength(1);
    await sb.from('meal_comments').update({ read_at: new Date().toISOString() }).in('id', [comments[0]!.id]);
    expect((await sb.from('meal_comments').select('read_at')).data![0]!.read_at).toBeTruthy();
    await sb.rpc('end_coach_link', { link: coach[0]!.link_id });
    expect((await sb.rpc('my_coach')).data).toEqual([]);
  });
});
