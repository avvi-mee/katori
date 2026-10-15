import { beforeAll, describe, expect, it } from 'vitest';

import { asAnon, asUser, createDb, createUser, type Db } from './harness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: Db;
let foodId: string;
const workoutOf: Record<string, string> = {};
const habitOf: Record<string, string> = {};
const templateOf: Record<string, string> = {};

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

    // Phase 1B tables
    const ex = await db.query<{ id: string }>(
      `insert into exercises (name, source, owner_id) values ('My curl', 'custom', $1) returning id`,
      [uid],
    );
    const tpl = await db.query<{ id: string }>(
      `insert into workout_templates (owner_id, name, split) values ($1, 'My push', 'custom') returning id`,
      [uid],
    );
    templateOf[uid] = tpl.rows[0]!.id;
    await db.query(`insert into template_exercises (template_id, position, exercise_id) values ($1, 0, $2)`, [
      tpl.rows[0]!.id,
      ex.rows[0]!.id,
    ]);
    const w = await db.query<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Push') returning id`, [
      uid,
    ]);
    workoutOf[uid] = w.rows[0]!.id;
    await db.query(`insert into workout_sets (workout_id, exercise_id, set_no, kg, reps) values ($1, $2, 1, 20, 10)`, [
      w.rows[0]!.id,
      ex.rows[0]!.id,
    ]);
    await db.query(
      `insert into personal_records (user_id, exercise_id, kind, value, workout_id) values ($1, $2, 'weight', 20, $3)`,
      [uid, ex.rows[0]!.id, w.rows[0]!.id],
    );
    await db.query(`insert into activity_days (user_id, date, steps) values ($1, current_date, 8000)`, [uid]);
    await db.query(`insert into runs (user_id, distance_m, duration_s) values ($1, 5000, 1800)`, [uid]);
    const h = await db.query<{ id: string }>(
      `insert into habits (user_id, kind, name) values ($1, 'water', 'Water') returning id`,
      [uid],
    );
    habitOf[uid] = h.rows[0]!.id;
    await db.query(`insert into habit_logs (habit_id, value) values ($1, 250)`, [h.rows[0]!.id]);
    await db.query(`insert into goals (user_id, primary_goal, steps) values ($1, 'fat_loss', 10000)`, [uid]);
    await db.query(`insert into body_logs (user_id, date, waist_cm) values ($1, current_date, 80)`, [uid]);
    await db.query(`insert into storage.objects (bucket_id, name) values ('body-photos', $1)`, [`${uid}/front.jpg`]);
  }
  await db.query(`insert into exercises (slug, name, source) values ('lib_test_row', 'Library row', 'katori')`);
  await db.query(`insert into workout_templates (name, split) values ('Library PPL', 'ppl')`);
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
  { table: 'workouts', owner: 'user_id' },
  { table: 'personal_records', owner: 'user_id' },
  { table: 'activity_days', owner: 'user_id' },
  { table: 'runs', owner: 'user_id' },
  { table: 'habits', owner: 'user_id' },
  { table: 'goals', owner: 'user_id' },
  { table: 'body_logs', owner: 'user_id' },
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
      async (tx) =>
        (await tx.query<{ name: string }>(`select name from storage.objects where bucket_id = 'meal-photos'`)).rows,
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

describe('RLS: Phase 1B training, activity, habits, goals, body', () => {
  const C = '00000000-0000-4000-8000-0000000000c1';

  it('exercises: library rows + own custom rows only', async () => {
    const rows = await asUser(
      db,
      A,
      async (tx) => (await tx.query<{ owner_id: string | null }>(`select owner_id from exercises`)).rows,
    );
    expect(rows.some((r) => r.owner_id === null)).toBe(true);
    expect(rows.filter((r) => r.owner_id !== null).every((r) => r.owner_id === A)).toBe(true);
    expect(rows.filter((r) => r.owner_id === A)).toHaveLength(1);
  });

  it('exercises: users cannot add or edit library rows, only their own custom ones', async () => {
    await expect(
      asUser(db, A, (tx) => tx.query(`insert into exercises (name, source) values ('Fake lib', 'katori')`)),
    ).rejects.toThrow(/row-level security|custom_has_owner/);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into exercises (name, source, owner_id) values ('Theirs', 'custom', '${B}')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const lib = await asUser(db, A, (tx) => tx.query(`update exercises set name = 'x' where owner_id is null`));
    expect(lib.affectedRows ?? 0).toBe(0);
    const own = await asUser(db, A, (tx) =>
      tx.query(`insert into exercises (name, source, owner_id) values ('Band pull', 'custom', '${A}')`),
    );
    expect(own.affectedRows).toBe(1);
  });

  it('workout_templates + template_exercises: library and own only, own writes only', async () => {
    const tpls = await asUser(
      db,
      A,
      async (tx) => (await tx.query<{ owner_id: string | null }>(`select owner_id from workout_templates`)).rows,
    );
    expect(tpls.some((r) => r.owner_id === null)).toBe(true);
    expect(tpls.filter((r) => r.owner_id !== null).every((r) => r.owner_id === A)).toBe(true);
    const te = await asUser(
      db,
      B,
      async (tx) =>
        (
          await tx.query<{ owner_id: string | null }>(
            `select t.owner_id from template_exercises te join workout_templates t on t.id = te.template_id`,
          )
        ).rows,
    );
    expect(te.every((r) => r.owner_id === null || r.owner_id === B)).toBe(true);
    await expect(
      asUser(db, A, (tx) => tx.query(`insert into workout_templates (owner_id, name) values (null, 'Sneaky lib')`)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into template_exercises (template_id, position, exercise_id)
           select '${templateOf[B]}', 9, id from exercises where owner_id is null limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("workout_sets: visible only through own workouts; cannot add sets to someone else's workout", async () => {
    const n = await asUser(db, A, async (tx) => (await tx.query(`select 1 from workout_sets`)).rows.length);
    expect(n).toBe(1);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into workout_sets (workout_id, exercise_id, set_no, kg, reps)
           select '${workoutOf[B]}', id, 2, 50, 5 from exercises where owner_id is null limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const own = await asUser(db, A, (tx) =>
      tx.query(
        `insert into workout_sets (workout_id, exercise_id, set_no, kg, reps)
         select '${workoutOf[A]}', id, 2, 50, 5 from exercises where owner_id is null limit 1`,
      ),
    );
    expect(own.affectedRows).toBe(1);
  });

  it('workouts / runs / activity / goals / body: cannot write rows for another user', async () => {
    for (const sql of [
      `insert into workouts (user_id) values ('${B}')`,
      `insert into runs (user_id, distance_m, duration_s) values ('${B}', 1000, 600)`,
      `insert into activity_days (user_id, date, steps) values ('${B}', current_date - 1, 100)`,
      `insert into goals (user_id) values ('${C}')`,
      `insert into body_logs (user_id, date) values ('${B}', current_date - 1)`,
      `insert into habits (user_id, kind, name) values ('${B}', 'custom', 'x')`,
    ])
      await expect(asUser(db, A, (tx) => tx.query(sql))).rejects.toThrow(/row-level security/);
    const upd = await asUser(db, A, (tx) => tx.query(`update goals set steps = 1 where user_id = '${B}'`));
    expect(upd.affectedRows ?? 0).toBe(0);
  });

  it("habit_logs: own habits only; cannot log against someone else's habit", async () => {
    const n = await asUser(db, B, async (tx) => (await tx.query(`select 1 from habit_logs`)).rows.length);
    expect(n).toBe(1);
    await expect(
      asUser(db, A, (tx) => tx.query(`insert into habit_logs (habit_id, value) values ('${habitOf[B]}', 1)`)),
    ).rejects.toThrow(/row-level security/);
  });

  it('personal_records: users cannot write them (trigger only)', async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into personal_records (user_id, exercise_id, kind, value, workout_id)
           select '${A}', id, 'weight', 999, '${workoutOf[A]}' from exercises where owner_id is null limit 1`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('body-photos storage: own folder only', async () => {
    const names = await asUser(
      db,
      A,
      async (tx) =>
        (await tx.query<{ name: string }>(`select name from storage.objects where bucket_id = 'body-photos'`)).rows,
    );
    expect(names.map((r) => r.name)).toEqual([`${A}/front.jpg`]);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name) values ('body-photos', '${B}/x.jpg')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('profiles.preferences: users can update it, and it must be an object', async () => {
    const ok = await asUser(db, A, (tx) =>
      tx.query(`update profiles set preferences = '{"training_days":4}' where id = '${A}'`),
    );
    expect(ok.affectedRows).toBe(1);
    await expect(
      asUser(db, A, (tx) => tx.query(`update profiles set preferences = '[1]' where id = '${A}'`)),
    ).rejects.toThrow(/preferences_is_object/);
  });

  it('deleting a user removes their training data, including custom exercises used in sets', async () => {
    await createUser(db, C);
    const ex = await db.query<{ id: string }>(
      `insert into exercises (name, source, owner_id) values ('C move', 'custom', $1) returning id`,
      [C],
    );
    const w = await db.query<{ id: string }>(`insert into workouts (user_id) values ($1) returning id`, [C]);
    await db.query(`insert into workout_sets (workout_id, exercise_id, set_no, kg, reps) values ($1, $2, 1, 10, 10)`, [
      w.rows[0]!.id,
      ex.rows[0]!.id,
    ]);
    await db.query(`delete from auth.users where id = $1`, [C]);
    const { rows } = await db.query(`select 1 from exercises where owner_id = $1`, [C]);
    expect(rows).toHaveLength(0);
  });
});
