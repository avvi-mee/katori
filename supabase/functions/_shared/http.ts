import * as Sentry from 'npm:@sentry/deno@9.47.2';
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.3';
import type { z } from 'npm:zod@4.6.7';

import type { ErrorCode } from './gen/types/meal.ts';

type Code = ErrorCode | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL';

const STATUS: Record<Code, number> = {
  UNAUTHENTICATED: 401,
  NEEDS_PRO: 402,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  BAD_IMAGE: 422,
  AI_UNAVAILABLE: 503,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(
    public code: Code,
    message: string,
  ) {
    super(message);
  }
}

/** Throw the doc's error contract: { error: { code, message } }. */
export function fail(code: Code, message: string = code): never {
  throw new HttpError(code, message);
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export type Admin = SupabaseClient;

/** Service-role client: bypasses RLS, so every query must filter by the verified user id. */
export const adminClient = (): Admin =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function requireUser(req: Request, admin: Admin): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) fail('UNAUTHENTICATED', 'Sign in again.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) fail('UNAUTHENTICATED', 'Sign in again.');
  return data.user;
}

export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    fail('BAD_REQUEST', 'Body must be JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    fail('BAD_REQUEST', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return parsed.data;
}

const sentryDsn = Deno.env.get('SENTRY_DSN');
if (sentryDsn) Sentry.init({ dsn: sentryDsn, sendDefaultPii: false, tracesSampleRate: 0 });

/** Unexpected (non-contract) errors go to Sentry; never includes request bodies. */
export async function reportError(e: unknown, fn: string) {
  console.error(fn, e);
  if (!sentryDsn) return;
  Sentry.captureException(e, { tags: { function: fn } });
  await Sentry.flush(2000);
}

/** Wraps a POST handler with CORS, the error contract and logging. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: { code: 'BAD_REQUEST', message: 'POST only' } }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, STATUS[e.code]);
      await reportError(e, new URL(req.url).pathname.split('/').pop() ?? 'function');
      return json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500);
    }
  });
}
