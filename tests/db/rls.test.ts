import { beforeAll, describe, expect, it } from 'vitest';

import { asAnon, asUser, createDb, createUser, type Db } from './harness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: Db;
let foodId: string;

beforeAll(async () => {
  db = await createDb();
  await createUser(db, A);
  await createUser(db, B);
  foodId = (await db.query<{ id: string }>(`select id from food_items limit 1`)).rows[0]!.id;

  // Seed one row per user in every user-owned table, as the service role would.
  for (const uid of [A, B]) {
    const meal = await db.query<{ id: string }>(
      `insert into meals (user_id, meal_type, input_mode, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g)
       values ($1, 'lunch', 'photo', 500, 450, 550, 20, 60, 15) returning id`,
      [uid],
    );
    const mealId = meal.rows[0]!.id;
    await db.query(
      `insert into meal_items (meal_id, food_item_id, dish, unit, qty, grams, kcal, protein_g, carbs_g, fat_g)
       values ($1, $2, 'Dal tadka', 'katori', 1, 150, 180, 9, 21, 7)`,
      [mealId, foodId],
    );
    await db.query(`insert into user_dish_defaults (user_id, food_item_id, unit, qty) values ($1, $2, 'katori', 1)`, [
      uid,
      foodId,
    ]);
    await db.query(
      `insert into coach_messages (user_id, day, persona, trigger, text) values ($1, current_date, 'gym_bro', 'meal', 'hi')`,
      [uid],
    );
    await db.query(`insert into weights (user_id, date, weight_kg) values ($1, current_date, 70)`, [uid]);
    await db.query(`insert into usage (user_id, day, scans) values ($1, current_date, 1)`, [uid]);
    await db.query(
      `insert into subscriptions (user_id, provider, plan, status) values ($1, 'razorpay', 'monthly', 'active')`,
      [uid],
    );
    await db.query(
      `insert into meal_drafts (user_id, meal_type, input_mode, items, questions) values ($1, 'lunch', 'photo', '[]', '[]')`,
      [uid],
    );
    await db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
      uid,
      `https://push.example/${uid}`,
    ]);
    await db.query(`insert into storage.objects (bucket_id, name) values ('meal-photos', $1)`, [`${uid}/photo.jpg`]);
  }
  await db.query(`insert into ai_cache (key, payload) values ('dal|katori|1', '{}')`);
});

const OWNED = [
  { table: 'profiles', owner: 'id' },
  { table: 'meals', owner: 'user_id' },
  { table: 'user_dish_defaults', owner: 'user_id' },
  { table: 'coach_messages', owner: 'user_id' },
  { table: 'weights', owner: 'user_id' },
  { table: 'usage', owner: 'user_id' },
  { table: 'subscriptions', owner: 'user_id' },
  { table: 'meal_drafts', owner: 'user_id' },
  { table: 'push_subscriptions', owner: 'user_id' },
];

describe('RLS', () => {
  it('is enabled on every table in public and storage.objects', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  for (const { table, owner } of OWNED) {
    it(`${table}: a user sees only their own rows`, async () => {
      const rows = await asUser(
        db,
        A,
        async (tx) => (await tx.query<Record<string, string>>(`select ${owner} from ${table}`)).rows,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]![owner]).toBe(A);
    });
    it(`${table}: anon sees nothing`, async () => {
      const rows = await asAnon(db, async (tx) => (await tx.query(`select 1 from ${table}`)).rows);
      expect(rows.length).toBe(0);
    });
  }

  it('meal_items: only items of own meals are visible', async () => {
    const n = await asUser(db, B, async (tx) => (await tx.query(`select 1 from meal_items`)).rows.length);
    expect(n).toBe(1);
  });

  it('ai_cache is invisible to users', async () => {
    const n = await asUser(db, A, async (tx) => (await tx.query(`select 1 from ai_cache`)).rows.length);
    expect(n).toBe(0);
  });

  it('food_items are readable by everyone', async () => {
    const n = await asAnon(db, async (tx) => (await tx.query(`select 1 from food_items`)).rows.length);
    expect(n).toBeGreaterThan(300);
  });

  const serviceOnlyInserts: [string, string][] = [
    [
      'meals',
      `insert into meals (user_id, meal_type, input_mode, kcal, kcal_low, kcal_high, protein_g, carbs_g, fat_g) values ('${A}', 'lunch', 'manual', 1, 1, 1, 1, 1, 1)`,
    ],
    [
      'subscriptions',
      `insert into subscriptions (user_id, provider, plan, status) values ('${A}', 'razorpay', 'yearly', 'active')`,
    ],
    ['usage', `insert into usage (user_id, day) values ('${A}', current_date + 1)`],
    [
      'user_dish_defaults',
      `insert into user_dish_defaults (user_id, food_item_id, unit, qty) select '${A}', id, 'g', 1 from food_items offset 5 limit 1`,
    ],
    [
      'coach_messages',
      `insert into coach_messages (user_id, day, persona, trigger, text) values ('${A}', current_date, 'gym_bro', 'x', 'y')`,
    ],
    [
      'meal_drafts',
      `insert into meal_drafts (user_id, meal_type, input_mode, items, questions) values ('${A}', 'lunch', 'photo', '[]', '[]')`,
    ],
    ['ai_cache', `insert into ai_cache (key, payload) values ('x', '{}')`],
    [
      'food_items',
      `insert into food_items (slug, name, kind, kcal_100g, protein_100g, carbs_100g, fat_100g, source) values ('x', 'x', 'dish', 1, 1, 1, 1, 'recipe')`,
    ],
  ];
  for (const [table, sql] of serviceOnlyInserts) {
    it(`${table}: users cannot insert (service role only)`, async () => {
      await expect(asUser(db, A, (tx) => tx.query(sql))).rejects.toThrow(/row-level security|permission denied/);
    });
  }

  it('subscriptions: a user cannot upgrade themselves', async () => {
    const res = await asUser(db, A, (tx) =>
      tx.query(`update subscriptions set plan = 'yearly' where user_id = '${A}'`),
    );
    expect(res.affectedRows ?? 0).toBe(0);
  });

  it("profiles: a user can update their own profile but not someone else's", async () => {
    const own = await asUser(db, A, (tx) => tx.query(`update profiles set name = 'Asha' where id = '${A}'`));
    expect(own.affectedRows).toBe(1);
    const other = await asUser(db, A, (tx) => tx.query(`update profiles set name = 'x' where id = '${B}'`));
    expect(other.affectedRows ?? 0).toBe(0);
  });

  it('profiles: a user cannot make themselves a coach', async () => {
    await expect(
      asUser(db, A, (tx) => tx.query(`update profiles set role = 'coach' where id = '${A}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('profiles: savage mode requires the 18+ confirmation', async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`update profiles set savage_mode = true, adult_confirmed = false where id = '${A}'`),
      ),
    ).rejects.toThrow(/savage_needs_adult/);
    const ok = await asUser(db, A, (tx) =>
      tx.query(`update profiles set savage_mode = true, adult_confirmed = true where id = '${A}'`),
    );
    expect(ok.affectedRows).toBe(1);
  });

  it('meals: a user can delete their own meal (items cascade) but not another user’s', async () => {
    const result = await asUser(db, A, async (tx) => {
      const other = await tx.query(`delete from meals where user_id = '${B}'`);
      const own = await tx.query(`delete from meals where user_id = '${A}'`);
      return { other: other.affectedRows ?? 0, own: own.affectedRows ?? 0 };
    });
    expect(result).toEqual({ other: 0, own: 1 });
  });

  it('weights: a user cannot write a weight for someone else', async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into weights (user_id, date, weight_kg) values ('${B}', current_date - 1, 80)`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('storage: a user reads and uploads only inside their own folder', async () => {
    const names = await asUser(
      db,
      A,
      async (tx) => (await tx.query<{ name: string }>(`select name from storage.objects`)).rows,
    );
    expect(names.map((r) => r.name)).toEqual([`${A}/photo.jpg`]);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('meal-photos', '${B}/evil.jpg')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asUser(db, A, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name) values ('meal-photos', '${A}/new.jpg')`),
    );
    expect(ok.affectedRows).toBe(1);
  });

  it('bump_usage: service-only, and increments atomically', async () => {
    await expect(
      asUser(db, A, (tx) => tx.query(`select bump_usage('${A}'::uuid, current_date + 3, 1)`)),
    ).rejects.toThrow(/permission denied/);
    await db.query(`select bump_usage($1::uuid, current_date + 3, 1)`, [B]);
    await db.query(`select bump_usage($1::uuid, current_date + 3, 1, 2)`, [B]);
    const { rows } = await db.query<{ scans: number; text_logs: number }>(
      `select scans, text_logs from usage where user_id = $1 and day = current_date + 3`,
      [B],
    );
    expect(rows[0]).toEqual({ scans: 2, text_logs: 2 });
  });

  it('scan_logs / scan_costs_daily are not readable by app users', async () => {
    await expect(asUser(db, A, (tx) => tx.query(`select * from scan_logs`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, A, (tx) => tx.query(`select * from scan_costs_daily`))).rejects.toThrow(
      /permission denied/,
    );
    const { rows } = await db.query<{ scans: string }>(`select sum(scans)::text as scans from scan_costs_daily`);
    expect(Number(rows[0]?.scans)).toBeGreaterThan(0);
  });

  it('new auth users get a profile automatically', async () => {
    const C = '00000000-0000-4000-8000-00000000000c';
    await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"full_name":"Ravi"}')`, [C]);
    const { rows } = await db.query<{ name: string; persona: string }>(
      `select name, persona from profiles where id = $1`,
      [C],
    );
    expect(rows[0]).toEqual({ name: 'Ravi', persona: 'hype_friend' });
  });

  it('match_food_item finds dishes by alias with typos', async () => {
    const { rows } = await db.query<{ name: string }>(`select name from match_food_item('chapati')`);
    expect(rows[0]?.name).toMatch(/Roti/);
    const typo = await db.query<{ name: string }>(`select name from match_food_item('dal tadkaa')`);
    expect(typo.rows[0]?.name).toBe('Dal Tadka');
  });
});
