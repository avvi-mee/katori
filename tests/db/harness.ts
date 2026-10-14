/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** Fresh in-memory Postgres with the Supabase shim and every migration applied. */
export async function createDb() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
  const dir = join(root, 'supabase', 'migrations');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function createUser(db: Db, id: string, email = `${id.slice(0, 8)}@test.dev`) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}

/** Run `fn` as an authenticated user (RLS applies). Rolled back afterwards. */
export async function asUser<T>(db: Db, uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return asRole(db, 'authenticated', uid, fn);
}

export async function asAnon<T>(db: Db, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return asRole(db, 'anon', null, fn);
}

async function asRole<T>(db: Db, role: string, uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let out!: T;
  let err: unknown;
  await db
    .transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      try {
        out = await fn(tx);
      } catch (e) {
        err = e;
      }
      await tx.rollback();
    })
    .catch(() => {});
  if (err) throw err;
  return out;
}
