import type { Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

import { asAnon, asUser, createDb, createUser, type Db } from './harness';

const R = '00000000-0000-4000-8000-0000000000f1'; // referrer
const N = '00000000-0000-4000-8000-0000000000f2'; // new user
const O = '00000000-0000-4000-8000-0000000000f3'; // old account
const X = '00000000-0000-4000-8000-0000000000f4'; // outsider

let db: Db;

async function commitAs<T>(uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let out!: T;
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    out = await fn(tx);
  });
  return out;
}
const one = async <T>(uid: string, sql: string, params: unknown[] = []) =>
  (await commitAs(uid, (tx) => tx.query<{ v: T }>(sql, params))).rows[0]!.v;
const isPro = async (u: string) => (await db.query<{ p: boolean }>('select public.is_pro($1) as p', [u])).rows[0]!.p;
const addMeal = (u: string, protein = 20, at = 'now()') =>
  db.query(
    `insert into meals (user_id, meal_type, input_mode, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g, eaten_at)
     values ($1, 'lunch', 'manual', 500, 450, 550, $2, 60, 15, ${at})`,
    [u, protein],
  );

beforeAll(async () => {
  db = await createDb();
  for (const u of [R, N, X]) await createUser(db, u);
  await db.query(
    `insert into auth.users (id, email, created_at) values ($1, 'old@test.dev', now() - interval '60 days')`,
    [O],
  );
  await db.query(`update profiles set name = 'Riya Sharma', protein_target = 60 where id = $1`, [R]);
  await db.query(`update profiles set name = 'Nikhil', protein_target = 100 where id = $1`, [N]);
});

describe('referrals', () => {
  let code: string;

  it('gives each user a stable code and previews only the first name', async () => {
    code = await one<string>(R, 'select public.my_referral_code() as v');
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(await one<string>(R, 'select public.my_referral_code() as v')).toBe(code);
    const name = await asAnon(
      db,
      async (tx) => (await tx.query<{ v: string }>('select public.referral_preview($1) as v', [code])).rows[0]!.v,
    );
    expect(name).toBe('Riya');
  });

  it('blocks self-referral, old accounts and unknown codes; users cannot write referral rows', async () => {
    await expect(commitAs(R, (tx) => tx.query('select public.redeem_referral($1)', [code]))).rejects.toThrow(
      /yourself/,
    );
    await expect(commitAs(O, (tx) => tx.query('select public.redeem_referral($1)', [code]))).rejects.toThrow(
      /new accounts/,
    );
    await expect(commitAs(N, (tx) => tx.query('select public.redeem_referral($1)', ['ZZZZZZZZ']))).rejects.toThrow(
      /not found/,
    );
    await expect(
      asUser(db, N, (tx) => tx.query(`insert into referrals (referrer_id, referee_id) values ($1, $2)`, [R, N])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, R, (tx) => tx.query(`update profiles set referral_code = 'AAAAAAAA' where id = $1`, [R])),
    ).rejects.toThrow(/permission denied/);
  });

  it('rewards both with a month of Pro on the new user’s 3rd meal, once', async () => {
    expect(await one<string>(N, 'select public.redeem_referral($1) as v', [code])).toBe('Riya');
    await expect(commitAs(N, (tx) => tx.query('select public.redeem_referral($1)', [code]))).rejects.toThrow(
      /already referred/,
    );
    await addMeal(N);
    await addMeal(N);
    expect(await isPro(N)).toBe(false);
    await addMeal(N);
    expect(await isPro(N)).toBe(true);
    expect(await isPro(R)).toBe(true);
    await addMeal(N);
    const grants = (await db.query<{ n: number }>('select count(*)::int as n from pro_grants')).rows[0]!.n;
    expect(grants).toBe(2);
    const status = await asUser(
      db,
      N,
      async (tx) => (await tx.query('select pro, free_until is not null as free from public.my_pro_status()')).rows[0],
    );
    expect(status).toEqual({ pro: true, free: true });
    expect(await asUser(db, X, async (tx) => (await tx.query('select 1 from referrals')).rows.length)).toBe(0);
    expect(await asUser(db, X, async (tx) => (await tx.query('select 1 from pro_grants')).rows.length)).toBe(0);
  });

  it('stacks free months instead of overlapping them', async () => {
    await db.query(`select public.grant_pro_days($1, 30, 'referral')`, [R]);
    const until = (
      await db.query<{ d: number }>(
        `select extract(day from max(until) - now())::int as d from pro_grants where user_id = $1`,
        [R],
      )
    ).rows[0]!.d;
    expect(until).toBeGreaterThanOrEqual(59);
  });
});

describe('30-day protein challenge', () => {
  let cid: string;
  let code: string;

  it('creates a 30-day challenge with the creator as first member', async () => {
    const today = (
      await db.query<{ d: string }>(`select ((now() at time zone 'utc' + interval '330 minutes')::date)::text as d`)
    ).rows[0]!.d;
    cid = await one<string>(R, `select public.create_challenge('Office protein', $1::date, 'Riya') as v`, [today]);
    const c = (
      await db.query<{ invite_code: string; days: number }>(
        `select invite_code, (ends_on - starts_on + 1) as days from challenges where id = $1`,
        [cid],
      )
    ).rows[0]!;
    code = c.invite_code;
    expect(c.days).toBe(30);
    await expect(
      commitAs(R, (tx) => tx.query(`select public.create_challenge('Past', current_date - 10, 'Riya')`)),
    ).rejects.toThrow(/today or later/);
  });

  it('only members see the challenge, members and leaderboard', async () => {
    const preview = await asAnon(
      db,
      async (tx) => (await tx.query('select name, members from public.challenge_preview($1)', [code])).rows,
    );
    expect(preview).toEqual([{ name: 'Office protein', members: 1 }]);
    expect(await asUser(db, X, async (tx) => (await tx.query('select 1 from challenges')).rows.length)).toBe(0);
    await expect(
      asUser(db, X, (tx) => tx.query('select * from public.challenge_leaderboard($1)', [cid])),
    ).rejects.toThrow(/members only/);
    await expect(
      asUser(db, X, (tx) =>
        tx.query(`insert into challenge_members (challenge_id, user_id, display_name) values ($1, $2, 'x')`, [cid, X]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('ranks by protein-goal days against each member’s own target, without exposing meals', async () => {
    await commitAs(N, (tx) => tx.query(`select public.join_challenge($1, 'Nikhil')`, [code]));
    await addMeal(R, 70); // Riya target 60 → hit
    await db.query(`delete from meals where user_id = $1`, [N]);
    await addMeal(N, 80); // Nikhil target 100 → miss
    const board = await asUser(
      db,
      N,
      async (tx) =>
        (
          await tx.query('select display_name, days_hit, days_logged, is_me from public.challenge_leaderboard($1)', [
            cid,
          ])
        ).rows,
    );
    expect(board).toEqual([
      { display_name: 'Riya', days_hit: 1, days_logged: 1, is_me: false },
      { display_name: 'Nikhil', days_hit: 0, days_logged: 1, is_me: true },
    ]);
    // Members still can't read each other's meals.
    expect(
      await asUser(db, N, async (tx) => (await tx.query('select 1 from meals where user_id = $1', [R])).rows.length),
    ).toBe(0);
  });

  it('leaving removes you from the board', async () => {
    await commitAs(N, (tx) => tx.query('select public.leave_challenge($1)', [cid]));
    await expect(
      asUser(db, N, (tx) => tx.query('select * from public.challenge_leaderboard($1)', [cid])),
    ).rejects.toThrow(/members only/);
  });
});
