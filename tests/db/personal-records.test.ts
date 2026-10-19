import { beforeAll, describe, expect, it } from 'vitest';

import { asUser, createDb, createUser, type Db } from './harness';

const U = '00000000-0000-4000-8000-0000000000aa';
let db: Db;
let bench: string;
let w1: string;
let w2: string;

const insertSet = (workout: string, n: number, kg: number, reps: number, kind = 'working') =>
  db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [U]);
    await tx.query(
      `insert into workout_sets (workout_id, exercise_id, set_no, kind, kg, reps) values ($1, $2, $3, $4, $5, $6)`,
      [workout, bench, n, kind, kg, reps],
    );
  });

const prs = async (workout?: string) =>
  (
    await db.query<{ kind: string; value: string; kg: string | null; reps: number | null }>(
      `select kind, value::text, kg::text, reps from personal_records where user_id = $1 ${workout ? 'and workout_id = $2' : ''} order by kind`,
      workout ? [U, workout] : [U],
    )
  ).rows;

beforeAll(async () => {
  db = await createDb();
  await createUser(db, U);
  bench = (await db.query<{ id: string }>(`select id from exercises where slug = 'Barbell_Bench_Press_-_Medium_Grip'`))
    .rows[0]!.id;
  const mk = async (day: string) =>
    (
      await db.query<{ id: string }>(`insert into workouts (user_id, started_at) values ($1, $2) returning id`, [
        U,
        day,
      ])
    ).rows[0]!.id;
  w1 = await mk('2026-10-01T10:00:00Z');
  w2 = await mk('2026-10-04T10:00:00Z');
});

describe('personal record trigger', () => {
  it('treats the first sessions of an exercise as the baseline', async () => {
    await insertSet(w1, 1, 20, 12, 'warmup');
    await insertSet(w1, 2, 60, 8);
    expect(await prs()).toEqual([]);
    // Later sets in the same first workout can already beat the baseline.
    await insertSet(w1, 3, 60, 8);
    expect(await prs()).toEqual([]);
  });

  it('records heaviest weight, best e1RM and best session volume when beaten', async () => {
    await insertSet(w2, 1, 65, 6); // heavier: weight PR; e1RM 65×1.2=78 vs 60×1.2667=76 → e1RM PR
    const r = await prs(w2);
    expect(r.map((p) => p.kind)).toEqual(['e1rm', 'weight']);
    expect(r.find((p) => p.kind === 'weight')).toMatchObject({ value: '65.00', reps: 6 });
    expect(Number(r.find((p) => p.kind === 'e1rm')!.value)).toBeCloseTo(78, 2);
  });

  it('records best reps at a weight', async () => {
    await insertSet(w2, 2, 60, 10); // 10 reps at 60 beats 8 at 60; e1RM 80 beats 78; volume 390+600=990 > 960
    const kinds = (await prs(w2)).map((p) => p.kind);
    expect(kinds).toContain('reps');
    expect(kinds.filter((k) => k === 'e1rm')).toHaveLength(2);
  });

  it('keeps one volume PR per workout, updated as the session grows', async () => {
    const vol = async () => (await prs(w2)).filter((p) => p.kind === 'volume').map((p) => Number(p.value));
    expect(await vol()).toEqual([990]);
    await insertSet(w2, 3, 50, 10);
    expect(await vol()).toEqual([1490]);
  });

  it('ignores warm-ups and incomplete sets', async () => {
    const before = (await prs()).length;
    await insertSet(w2, 4, 200, 1, 'warmup');
    expect((await prs()).length).toBe(before);
  });

  it('users cannot write personal records themselves', async () => {
    await expect(
      asUser(db, U, (tx) =>
        tx.query(
          `insert into personal_records (user_id, exercise_id, kind, value, workout_id) values ($1, $2, 'weight', 999, $3)`,
          [U, bench, w2],
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });
});
