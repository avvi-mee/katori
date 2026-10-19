import type { Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

import { asAnon, asUser, createDb, createUser, type Db } from './harness';

// Coach C, second coach D; clients A (C's) and B (unrelated); E switches coaches.
const C = '00000000-0000-4000-8000-0000000000c1';
const D = '00000000-0000-4000-8000-0000000000d1';
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const E = '00000000-0000-4000-8000-0000000000e1';

let db: Db;
const meal: Record<string, string> = {};

/** Run as a user and commit (asUser rolls back). */
async function commitAs<T>(uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let out!: T;
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    out = await fn(tx);
  });
  return out;
}

const count = (uid: string, sql: string, params: unknown[] = []) =>
  asUser(db, uid, async (tx) => (await tx.query(sql, params)).rows.length);

const invite = async (coach: string) =>
  (await commitAs(coach, (tx) => tx.query<{ c: string }>('select public.create_coach_invite() as c'))).rows[0]!.c;
const accept = (client: string, code: string) =>
  commitAs(client, (tx) => tx.query('select public.accept_coach_invite($1)', [code]));

beforeAll(async () => {
  db = await createDb();
  for (const u of [C, D, A, B, E]) await createUser(db, u);
  for (const u of [A, B, E]) {
    meal[u] = (
      await db.query<{ id: string }>(
        `insert into meals (user_id, meal_type, input_mode, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g)
         values ($1, 'lunch', 'photo', 500, 450, 550, 20, 60, 15) returning id`,
        [u],
      )
    ).rows[0]!.id;
    await db.query(`insert into weights (user_id, date, weight_kg) values ($1, '2026-10-01', 70)`, [u]);
    await db.query(`insert into workouts (user_id) values ($1)`, [u]);
    await db.query(`insert into activity_days (user_id, date, steps) values ($1, '2026-10-01', 5000)`, [u]);
    await db.query(`insert into habits (user_id, kind, name) values ($1, 'water', 'Water')`, [u]);
    await db.query(`insert into storage.objects (bucket_id, name) values ('meal-photos', $1), ('body-photos', $1)`, [
      `${u}/x.jpg`,
    ]);
  }
});

describe('becoming a coach and inviting', () => {
  it('only coaches can create invites', async () => {
    await expect(invite(C)).rejects.toThrow(/coaches only/);
    await commitAs(C, (tx) => tx.query(`select public.become_coach('Coach Vikram')`));
    await commitAs(D, (tx) => tx.query(`select public.become_coach('Coach Divya')`));
    const code = await invite(C);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(await invite(C)).toBe(code); // reuses the open invite
  });

  it('users cannot make themselves coaches by editing their profile', async () => {
    await expect(
      asUser(db, B, (tx) => tx.query(`update profiles set role = 'coach' where id = $1`, [B])),
    ).rejects.toThrow(/permission denied/);
  });

  it('shows only the coach name before sign-in', async () => {
    const code = await invite(C);
    const rows = await asAnon(
      db,
      async (tx) => (await tx.query('select * from public.coach_invite_preview($1)', [code])).rows,
    );
    expect(rows).toEqual([{ coach_name: 'Coach Vikram', valid: true }]);
  });
});

describe('coach access follows the link', () => {
  it('nothing is visible before the client accepts', async () => {
    expect(await count(C, 'select 1 from meals where user_id = $1', [A])).toBe(0);
  });

  it('after explicit consent the coach reads that client, and only that client', async () => {
    await accept(A, await invite(C));
    for (const [table, col] of [
      ['meals', 'user_id'],
      ['weights', 'user_id'],
      ['workouts', 'user_id'],
      ['activity_days', 'user_id'],
      ['habits', 'user_id'],
      ['profiles', 'id'],
    ]) {
      expect(await count(C, `select 1 from ${table} where ${col} = $1`, [A]), table).toBe(1);
      expect(await count(C, `select 1 from ${table} where ${col} = $1`, [B]), table).toBe(0);
      expect(await count(D, `select 1 from ${table} where ${col} = $1`, [A]), `${table} other coach`).toBe(0);
    }
    expect(
      await count(C, 'select 1 from meal_items mi join meals m on m.id = mi.meal_id where m.user_id = $1', [B]),
    ).toBe(0);
  });

  it('meal photos are shared with the coach; body photos are not', async () => {
    expect(
      await count(C, `select 1 from storage.objects where bucket_id = 'meal-photos' and name = $1`, [`${A}/x.jpg`]),
    ).toBe(1);
    expect(
      await count(C, `select 1 from storage.objects where bucket_id = 'body-photos' and name = $1`, [`${A}/x.jpg`]),
    ).toBe(0);
    expect(
      await count(C, `select 1 from storage.objects where bucket_id = 'meal-photos' and name = $1`, [`${B}/x.jpg`]),
    ).toBe(0);
  });

  it('coaches cannot write meals or the client profile', async () => {
    await expect(
      asUser(db, C, (tx) =>
        tx.query(
          `insert into meals (user_id, meal_type, input_mode, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g) values ($1, 'lunch', 'manual', 1, 1, 1, 1, 1, 1)`,
          [A],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
    const updated = await asUser(
      db,
      C,
      async (tx) => (await tx.query(`update profiles set kcal_target = 1 where id = $1`, [A])).affectedRows,
    );
    expect(updated ?? 0).toBe(0);
    const deleted = await asUser(
      db,
      C,
      async (tx) => (await tx.query(`delete from meals where user_id = $1`, [A])).affectedRows,
    );
    expect(deleted ?? 0).toBe(0);
  });

  it('coaches set targets as "coach" only, and only for active clients', async () => {
    await commitAs(C, (tx) =>
      tx.query(`insert into goals (user_id, kcal, protein_g, updated_by) values ($1, 1900, 140, 'coach')`, [A]),
    );
    expect(await count(A, `select 1 from goals where user_id = $1 and updated_by = 'coach'`, [A])).toBe(1);
    await expect(
      asUser(db, C, (tx) => tx.query(`update goals set kcal = 1800, updated_by = 'user' where user_id = $1`, [A])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, C, (tx) => tx.query(`insert into goals (user_id, kcal, updated_by) values ($1, 1800, 'coach')`, [B])),
    ).rejects.toThrow(/row-level security/);
  });

  it('coaches assign plans to their clients only', async () => {
    await commitAs(C, (tx) =>
      tx.query(
        `insert into workout_templates (owner_id, name, assigned_by_coach_id, plan_weekdays) values ($1, 'Push day', $2, '{1,4}')`,
        [A, C],
      ),
    );
    expect(
      await count(A, `select 1 from workout_templates where owner_id = $1 and assigned_by_coach_id = $2`, [A, C]),
    ).toBe(1);
    await expect(
      asUser(db, C, (tx) =>
        tx.query(`insert into workout_templates (owner_id, name, assigned_by_coach_id) values ($1, 'Sneaky', $2)`, [
          B,
          C,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('comments: the client reads and marks read; coaches cannot write directly; others see nothing', async () => {
    await db.query(
      `insert into meal_comments (meal_id, author_id, body, reaction) values ($1, $2, 'Nice dal!', 'great')`,
      [meal[A], C],
    );
    expect(await count(A, 'select 1 from meal_comments')).toBe(1);
    expect(await count(C, 'select 1 from meal_comments')).toBe(1);
    expect(await count(D, 'select 1 from meal_comments')).toBe(0);
    expect(await count(B, 'select 1 from meal_comments')).toBe(0);
    const marked = await asUser(
      db,
      A,
      async (tx) => (await tx.query(`update meal_comments set read_at = now()`)).affectedRows,
    );
    expect(marked).toBe(1);
    await expect(asUser(db, A, (tx) => tx.query(`update meal_comments set body = 'edited'`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(db, C, (tx) =>
        tx.query(`insert into meal_comments (meal_id, author_id, body) values ($1, $2, 'x')`, [meal[A], C]),
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it('one trainer at a time: accepting a new invite ends the old link', async () => {
    await accept(E, await invite(C));
    expect(await count(C, 'select 1 from meals where user_id = $1', [E])).toBe(1);
    await accept(E, await invite(D));
    expect(await count(C, 'select 1 from meals where user_id = $1', [E])).toBe(0);
    expect(await count(D, 'select 1 from meals where user_id = $1', [E])).toBe(1);
  });

  it('an invite works once', async () => {
    const code = await invite(C);
    await accept(B, code);
    await expect(accept(E, code)).rejects.toThrow(/already used/);
    // B leaves straight away.
    const link = (
      await db.query<{ id: string }>(`select id from coach_clients where client_id = $1 and status = 'active'`, [B])
    ).rows[0]!.id;
    await commitAs(B, (tx) => tx.query('select public.end_coach_link($1)', [link]));
  });

  it('leaving ends access immediately, including comments', async () => {
    const link = (
      await db.query<{ id: string }>(`select id from coach_clients where client_id = $1 and status = 'active'`, [A])
    ).rows[0]!.id;
    await expect(commitAs(D, (tx) => tx.query('select public.end_coach_link($1)', [link]))).rejects.toThrow(
      /not found/,
    );
    await commitAs(A, (tx) => tx.query('select public.end_coach_link($1)', [link]));
    for (const table of ['meals', 'weights', 'workouts', 'habits', 'goals']) {
      expect(await count(C, `select 1 from ${table} where user_id = $1`, [A]), table).toBe(0);
    }
    expect(await count(C, 'select 1 from meal_comments')).toBe(0);
    expect(await count(C, `select 1 from storage.objects where name = $1`, [`${A}/x.jpg`])).toBe(0);
  });
});

describe('trainer billing and sponsored Pro', () => {
  it("clients of a paying trainer are Pro; ended clients aren't", async () => {
    await accept(A, await invite(C));
    const isPro = async (u: string) =>
      (await db.query<{ p: boolean }>('select public.is_pro($1) as p', [u])).rows[0]!.p;
    expect(await isPro(A)).toBe(false);
    await db.query(
      `insert into subscriptions (user_id, provider, plan, status, current_period_end, quantity) values ($1, 'razorpay', 'coach', 'active', now() + interval '20 days', 2)`,
      [C],
    );
    expect(await isPro(A)).toBe(true);
    expect(await isPro(C)).toBe(true);
    expect(await isPro(B)).toBe(false); // B left C
    const status = await asUser(db, A, async (tx) => (await tx.query('select * from public.my_pro_status()')).rows[0]);
    expect(status).toEqual({ pro: true, sponsored_by: 'Coach Vikram', free_until: null });
    const coach = await asUser(db, A, async (tx) => (await tx.query('select coach_name from public.my_coach()')).rows);
    expect(coach).toEqual([{ coach_name: 'Coach Vikram' }]);
  });

  it('coach billing rows are private to the coach and written only by the server', async () => {
    await db.query(
      `insert into coach_billing (coach_id, period, active_clients, amount) values ($1, '2026-10-01', 2, 198)`,
      [C],
    );
    expect(await count(C, 'select 1 from coach_billing')).toBe(1);
    expect(await count(D, 'select 1 from coach_billing')).toBe(0);
    await expect(
      asUser(db, C, (tx) =>
        tx.query(
          `insert into coach_billing (coach_id, period, active_clients, amount) values ($1, '2026-11-01', 0, 0)`,
          [C],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, C, (tx) => tx.query(`insert into coach_clients (coach_id, invite_code) values ($1, 'ABCDEFGH')`, [C])),
    ).rejects.toThrow(/row-level security/);
  });
});
