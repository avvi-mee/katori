// Demo mode (EXPO_PUBLIC_DEMO=1): a tiny in-browser stand-in for Supabase so every screen can be tried
// with no accounts. It answers the exact HTTP calls supabase-js makes, keeps data in localStorage, and
// reuses the real portion engine, quota rules and coach templates. Never loaded unless the flag is on.
import { checkQuota } from '@/features/billing/quota';
import { searchFoods } from '@/features/meals/search';
import { buildCoachMessage } from '@/features/personas/coach';
import { buildFacts, groupByDay } from '@/features/personas/facts';
import {
  applyAnswers,
  applyUsual,
  buildQuestions,
  computeItem,
  normalizeItem,
  totals,
  type ComputedItem,
  type Food,
  type PortionContext,
  type Usual,
} from '@/features/portions/engine';
import { detectPrs, type HistorySet } from '@/features/workouts/math';
import { istDay, istDayRange } from '@/lib/day';
import { applyOp, PRIMARY_KEY, type SyncTable } from '@/lib/outbox';
import type { DraftItem, MealSource, MealType, Question, Unit } from '@/types/meal';

import exercisesJson from './exercises.json';
import foodsJson from './food_items.json';

type FoodRow = Food & { slug: string; aliases: string[]; kind: string; cuisine: string | null; region: string | null };
const FOODS = foodsJson as unknown as FoodRow[];
const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export const DEMO_CODE = '123456';
const USER_ID = 'dddddddd-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;
type Db = {
  profile: Row | null;
  meals: Row[];
  usual: Row[];
  coach: Row[];
  drafts: Row[];
  usage: Row[];
  subscription: Row | null;
  /** Phase 1B tables (workouts, habits, activity, body, goals, custom exercises and templates). */
  tables: Partial<Record<SyncTable | 'personal_records', Row[]>>;
};

const KEY = 'katori-demo-db';
const empty = (): Db => ({
  profile: null,
  meals: [],
  usual: [],
  coach: [],
  drafts: [],
  usage: [],
  subscription: null,
  tables: {},
});
let memory: Db | null = null;

function load(): Db {
  if (memory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    memory = raw ? { ...empty(), ...(JSON.parse(raw) as Db) } : empty();
  } catch {
    memory = empty();
  }
  return memory;
}
function save(db: Db) {
  memory = db;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable: stays in memory */
  }
}
/** Test helper. */
export function resetDemo() {
  memory = empty();
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (code: string, message: string, status: number) => json({ error: { code, message } }, status);

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function session(email: string) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  return {
    access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USER_ID, exp, role: 'authenticated', email })}.demo`,
    token_type: 'bearer',
    expires_in: 7 * 24 * 3600,
    expires_at: exp,
    refresh_token: 'demo-refresh',
    user,
  };
}

const ctxOf = (db: Db): PortionContext => ({
  katori_ml: Number(db.profile?.katori_ml ?? 150),
  plate_size: (db.profile?.plate_size as PortionContext['plate_size']) ?? 'medium',
});
const usualMap = (db: Db) => new Map(db.usual.map((u) => [u.food_item_id as string, u as unknown as Usual]));
const isPro = (db: Db) =>
  db.subscription?.status === 'active' && Date.parse(String(db.subscription.current_period_end)) > Date.now();

// ─── PostgREST subset ────────────────────────────────────────────────────────
function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const [op, ...rest] = value.split('.');
    const v = rest.join('.');
    out = out.filter((r) => {
      const x = r[key];
      if (op === 'eq') return String(x) === v;
      if (op === 'gte') return String(x) >= v;
      if (op === 'lt') return String(x) < v;
      if (op === 'is') return v === 'null' ? x == null : x != null;
      if (op === 'not' && v === 'is.null') return x != null;
      if (op === 'in') return v.replace(/[()]/g, '').split(',').includes(String(x));
      return true;
    });
  }
  const order = params.get('order');
  if (order) {
    for (const part of order.split(',').reverse()) {
      const [col, dir] = part.split('.');
      out = [...out].sort((a, b) => (String(a[col!]) < String(b[col!]) ? -1 : 1) * (dir === 'desc' ? -1 : 1));
    }
  }
  const offset = Number(params.get('offset') ?? 0);
  const limit = params.get('limit');
  return out.slice(offset, limit ? offset + Number(limit) : undefined);
}

const respondRows = (rows: Row[], headers: Headers) =>
  headers.get('Accept')?.includes('vnd.pgrst.object')
    ? rows[0]
      ? json(rows[0])
      : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
    : json(rows);

function rest(db: Db, table: string, method: string, params: URLSearchParams, headers: Headers, body: Row | null) {
  switch (table) {
    case 'profiles': {
      if (method === 'PATCH' && db.profile) {
        db.profile = { ...db.profile, ...body, updated_at: new Date().toISOString() };
        save(db);
      }
      return respondRows(db.profile ? [db.profile] : [], headers);
    }
    case 'food_items':
      return respondRows(filterRows(FOODS as unknown as Row[], params), headers);
    case 'meals': {
      if (method === 'DELETE') {
        const ids = new Set(filterRows(db.meals, params).map((m) => m.id));
        db.meals = db.meals.filter((m) => !ids.has(m.id));
        save(db);
        return new Response(null, { status: 204 });
      }
      return respondRows(filterRows(db.meals, params), headers);
    }
    case 'user_dish_defaults': {
      const rows = filterRows(db.usual, params).map((u) => ({
        ...u,
        food_items: { name: FOOD_BY_ID.get(u.food_item_id as string)?.name ?? '' },
      }));
      return respondRows(rows, headers);
    }
    case 'coach_messages':
      return respondRows(filterRows(db.coach, params), headers);
    case 'subscriptions':
      return respondRows(db.subscription ? [db.subscription] : [], headers);
    case 'push_subscriptions':
      return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    default:
      return table in PRIMARY_KEY || table === 'personal_records'
        ? userTable(db, table as SyncTable | 'personal_records', method, params, headers, body)
        : json([]);
  }
}

// ─── Phase 1B tables ─────────────────────────────────────────────────────────
type SeedTemplate = {
  id: string;
  name: string;
  split: string;
  notes: string;
  exercises: [string, number, number, number, number][];
};
const EX = exercisesJson as unknown as { exercises: Row[]; templates: SeedTemplate[] };
const EX_ID = new Map(EX.exercises.map((e) => [e.slug as string, e.id as string]));
const LIBRARY: Partial<Record<SyncTable, Row[]>> = {
  exercises: EX.exercises,
  workout_templates: EX.templates.map((t, position) => ({
    id: t.id,
    owner_id: null,
    name: t.name,
    split: t.split,
    notes: t.notes,
    position,
  })),
  template_exercises: EX.templates.flatMap((t) =>
    t.exercises.map(([slug, sets, rep_min, rep_max, rest_s], position) => ({
      template_id: t.id,
      position,
      exercise_id: EX_ID.get(slug),
      sets,
      rep_min,
      rep_max,
      rest_s,
    })),
  ),
};

/** Mirrors the PR trigger: a batch of new sets is checked against every earlier set. */
function recordPrs(db: Db, sets: Row[]) {
  const all = (db.tables.workout_sets ?? []) as unknown as HistorySet[];
  const fresh = new Set(sets.map((s) => s.id));
  const history = all.filter((s) => !fresh.has((s as unknown as Row).id as string));
  const session = all.filter((s) => fresh.has((s as unknown as Row).id as string));
  const workout = session[0]?.workout_id;
  const prs = (db.tables.personal_records ?? []).filter((p) => !(p.workout_id === workout && p.kind === 'volume'));
  for (const hit of detectPrs(history, session)) {
    if (
      hit.kind !== 'volume' &&
      prs.some((p) => p.workout_id === workout && p.exercise_id === hit.exercise_id && p.kind === hit.kind)
    )
      continue;
    prs.push({
      id: crypto.randomUUID(),
      user_id: USER_ID,
      workout_id: workout,
      achieved_at: new Date().toISOString(),
      ...hit,
    });
  }
  db.tables.personal_records = prs;
}

function userTable(
  db: Db,
  table: SyncTable | 'personal_records',
  method: string,
  params: URLSearchParams,
  headers: Headers,
  body: Row | null,
) {
  const own = (db.tables[table] ??= []);
  if (method === 'GET') {
    const library = table === 'personal_records' ? [] : (LIBRARY[table] ?? []);
    return respondRows(filterRows([...library, ...own], params), headers);
  }
  if (table === 'personal_records') return fail('42501', 'permission denied', 403);
  if (method === 'POST') {
    const rows = (Array.isArray(body) ? body : [body]).filter(Boolean) as Row[];
    db.tables[table] = applyOp(own, { kind: 'upsert', table, rows });
    if (table === 'workout_sets') recordPrs(db, rows);
    save(db);
    return new Response(null, { status: 201 });
  }
  if (method === 'PATCH') {
    const hit = new Set(filterRows(own, params));
    db.tables[table] = own.map((r) => (hit.has(r) ? { ...r, ...body } : r));
    save(db);
    return new Response(null, { status: 204 });
  }
  if (method === 'DELETE') {
    const hit = new Set(filterRows(own, params));
    db.tables[table] = own.filter((r) => !hit.has(r));
    if (table === 'workouts')
      db.tables.workout_sets = (db.tables.workout_sets ?? []).filter(
        (s) => !own.some((w) => hit.has(w) && w.id === s.workout_id),
      );
    save(db);
    return new Response(null, { status: 204 });
  }
  return json([]);
}

// ─── Edge Functions ──────────────────────────────────────────────────────────
type AiItem = { key: string; dish: string; unit: Unit; qty: number; confidence: number; cooked: boolean };

/** "2 roti aur dal, 1 katori dahi" → items, by matching the dish table (no AI in demo). */
export function parseMealText(text: string): AiItem[] {
  const parts = text
    .toLowerCase()
    .split(/,|\+|\band\b|\baur\b|\bwith\b|\bke saath\b|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const items: AiItem[] = [];
  for (const part of parts) {
    const qtyMatch = part.match(/(\d+(\.\d+)?)/);
    const unitWord = part.match(/\d\s*(g|gm|gms|grams?|katori|bowl|plate|glass|pieces?|pcs?|scoop)\b/)?.[1];
    const words = part
      .replace(/(\d+(\.\d+)?)/g, ' ')
      .replace(/\b(g|gm|gms|grams?|katoris?|bowls?|plates?|glass(es)?|pieces?|pcs?|cups?|scoops?)\b/g, ' ')
      .trim();
    const food = searchFoods(FOODS, words, 1)[0];
    if (!food) continue;
    const unit: Unit = !unitWord
      ? (food.units.default as Unit)
      : unitWord.startsWith('g')
        ? 'g'
        : unitWord === 'bowl'
          ? 'katori'
          : unitWord.startsWith('p') && unitWord !== 'plate'
            ? 'piece'
            : (unitWord as Unit);
    items.push({
      key: food.slug.replace(/-/g, '_'),
      dish: food.name,
      unit,
      qty: qtyMatch ? Number(qtyMatch[1]) : 1,
      confidence: qtyMatch ? 0.85 : 0.6,
      cooked: food.default_oil_g > 0,
    });
  }
  return items;
}

const SAMPLE_THALI: AiItem[] = [
  { key: 'dal_tadka', dish: 'Dal Tadka', unit: 'katori', qty: 1, confidence: 0.65, cooked: true },
  { key: 'roti', dish: 'Roti', unit: 'roti', qty: 2, confidence: 0.9, cooked: false },
  { key: 'steamed_rice', dish: 'Steamed Rice', unit: 'scoop', qty: 1, confidence: 0.55, cooked: false },
  { key: 'aloo_gobi', dish: 'Aloo Gobi', unit: 'katori', qty: 1, confidence: 0.85, cooked: true },
];

function createDraft(db: Db, items: AiItem[], mealType: MealType, inputMode: 'photo' | 'text') {
  const ctx = ctxOf(db);
  const usual = usualMap(db);
  const foods = new Map<string, Food>();
  const draftItems: DraftItem[] = items.map((it) => {
    const food = searchFoods(FOODS, it.dish, 1)[0];
    const draft: DraftItem = { ...it, food_item_id: food?.id ?? null };
    if (!food) return draft;
    foods.set(food.id, food);
    return applyUsual(normalizeItem({ ...draft, dish: food.name }, food, ctx), usual.get(food.id));
  });
  const questions: Question[] = buildQuestions(draftItems, foods, ctx, { sourceKnown: false, usual });
  const draft = {
    id: crypto.randomUUID(),
    meal_type: mealType,
    input_mode: inputMode,
    items: draftItems,
    questions,
    created_at: new Date().toISOString(),
    consumed_at: null,
  };
  db.drafts.push(draft);
  save(db);
  return {
    draft_id: draft.id,
    items: draftItems,
    questions,
    source_guess: 'unknown',
    unmatched: draftItems.filter((i) => !i.food_item_id).map((i) => i.dish),
  };
}

function bumpUsage(db: Db, field: 'scans' | 'text_logs') {
  const day = istDay();
  let row = db.usage.find((u) => u.day === day);
  if (!row) db.usage.push((row = { day, scans: 0, text_logs: 0, last_request_at: null }));
  row[field] = Number(row[field] ?? 0) + 1;
}

function quota(db: Db, kind: 'scan' | 'text') {
  const u = db.usage.find((r) => r.day === istDay());
  // Demo skips the 3-second rate limit so you can click quickly; daily free limits stay real.
  const code = checkQuota(
    kind,
    u ? { scans: Number(u.scans), text_logs: Number(u.text_logs), last_request_at: null } : null,
    isPro(db),
    new Date(),
  );
  return code
    ? fail(
        code,
        code === 'NEEDS_PRO' ? 'Free AI limit reached for today.' : 'Daily limit reached.',
        code === 'NEEDS_PRO' ? 402 : 429,
      )
    : null;
}

function confirmMeal(db: Db, body: Row) {
  const existing = db.meals.find((m) => m.client_id === body.client_id);
  if (existing)
    return json({
      meal_id: existing.id,
      items: existing.meal_items,
      ...pickTotals(existing),
      duplicate: true,
      day_totals: dayTotals(db, String(existing.eaten_at)),
      coach_message: null,
    });

  const ctx = ctxOf(db);
  let computed: ComputedItem[];
  let source: MealSource = 'home';
  let mealType: MealType;
  let inputMode = 'manual';
  if (body.draft_id) {
    const draft = db.drafts.find((d) => d.id === body.draft_id && !d.consumed_at);
    if (!draft) return fail('NOT_FOUND', 'This scan expired. Please scan again.', 404);
    const items = draft.items as DraftItem[];
    const foods = new Map(
      items.flatMap((i) =>
        i.food_item_id && FOOD_BY_ID.get(i.food_item_id)
          ? [[i.food_item_id, FOOD_BY_ID.get(i.food_item_id)!] as const]
          : [],
      ),
    );
    const r = applyAnswers(items, draft.questions as Question[], (body.answers as never[]) ?? [], foods, ctx, {
      sourceGuess: 'unknown',
      usual: usualMap(db),
    });
    computed = r.items;
    source = r.source;
    mealType = draft.meal_type as MealType;
    inputMode = String(draft.input_mode);
    draft.consumed_at = new Date().toISOString();
  } else {
    source = (body.source as MealSource) ?? 'home';
    mealType = body.meal_type as MealType;
    computed = ((body.items as Row[]) ?? []).flatMap((it, n) => {
      const food = FOOD_BY_ID.get(it.food_item_id as string);
      return food
        ? [
            computeItem(
              food,
              {
                key: `item_${n}`,
                dish: food.name,
                unit: it.unit as Unit,
                qty: Number(it.qty),
                oil_level: (it.oil_level as never) ?? null,
                confidence: 1,
                certainty: 'asked',
              },
              ctx,
              source,
            ),
          ]
        : [];
    });
  }
  if (!computed.length) return fail('BAD_REQUEST', 'Nothing we could count in this meal.', 400);

  const t = totals(computed);
  const eatenAt = typeof body.eaten_at === 'string' ? body.eaten_at : new Date().toISOString();
  const meal = {
    id: crypto.randomUUID(),
    client_id: body.client_id,
    eaten_at: eatenAt,
    meal_type: mealType,
    source,
    input_mode: inputMode,
    photo_path: null,
    ...t,
    meal_items: computed.map((c) => ({
      id: crypto.randomUUID(),
      dish: c.dish,
      unit: c.unit,
      qty: c.qty,
      kcal: c.kcal,
      protein_g: c.protein_g,
    })),
  };
  db.meals.push(meal);

  for (const c of computed) {
    const u = db.usual.find((x) => x.food_item_id === c.food_item_id);
    if (u)
      Object.assign(u, {
        unit: c.unit,
        qty: c.qty,
        oil_level: c.oil_level,
        times_used: Number(u.times_used) + 1,
        updated_at: new Date().toISOString(),
      });
    else
      db.usual.push({
        food_item_id: c.food_item_id,
        unit: c.unit,
        qty: c.qty,
        oil_level: c.oil_level,
        times_used: 1,
        updated_at: new Date().toISOString(),
      });
  }

  let coach_message = null;
  if (db.profile && !db.profile.nudges_muted) {
    const facts = buildFacts(db.profile as never, 'meal_saved', new Date(eatenAt), groupByDay(db.meals as never));
    const m = buildCoachMessage(facts, db.profile as never, db.meals.length);
    coach_message = { text: m.text, persona: m.persona, gentle: m.tone === 'gentle' };
    db.coach.push({
      day: istDay(new Date(eatenAt)),
      persona: m.persona,
      text: m.text,
      facts: { tone: m.tone },
      created_at: new Date().toISOString(),
    });
  }
  save(db);
  return json({
    meal_id: meal.id,
    items: computed,
    ...t,
    source,
    unmatched: [],
    rejected: [],
    day_totals: dayTotals(db, eatenAt),
    coach_message,
  });
}

const pickTotals = (m: Row) => ({
  kcal: m.kcal,
  kcal_low: m.kcal_low,
  kcal_high: m.kcal_high,
  protein_g: m.protein_g,
  carbs_g: m.carbs_g,
  fat_g: m.fat_g,
});

function dayTotals(db: Db, at: string) {
  const { from, to } = istDayRange(istDay(new Date(at)));
  const rows = db.meals.filter((m) => String(m.eaten_at) >= from && String(m.eaten_at) < to);
  return { ...totals(rows as never), meals: rows.length };
}

async function fn(db: Db, name: string, body: Row) {
  switch (name) {
    case 'analyze-meal': {
      const blocked = quota(db, 'scan');
      if (blocked) return blocked;
      await new Promise((r) => setTimeout(r, 1800)); // feel of a real scan
      // The hint can steer the demo ("paneer, 3 roti"); otherwise a sample thali.
      const fromHint = typeof body.hint_text === 'string' ? parseMealText(body.hint_text) : [];
      const draft = createDraft(db, fromHint.length ? fromHint : SAMPLE_THALI, body.meal_type as MealType, 'photo');
      bumpUsage(db, 'scans');
      save(db);
      return json(draft);
    }
    case 'log-text': {
      const blocked = quota(db, 'text');
      if (blocked) return blocked;
      const items = parseMealText(String(body.text ?? ''));
      if (!items.length) return fail('BAD_IMAGE', 'No food found in that text.', 422);
      const draft = createDraft(db, items, body.meal_type as MealType, 'text');
      bumpUsage(db, 'text_logs');
      save(db);
      return json(draft);
    }
    case 'confirm-meal':
      return confirmMeal(db, body);
    case 'create-subscription': {
      const yearly = body.plan === 'yearly';
      db.subscription = {
        provider: 'dodo',
        plan: yearly ? 'yearly' : 'monthly',
        status: 'active',
        current_period_end: new Date(Date.now() + (yearly ? 365 : 30) * 86_400_000).toISOString(),
        cancel_at_period_end: false,
      };
      save(db);
      // Demo "checkout" succeeds instantly and returns to Me.
      return json({ provider: 'dodo', kind: 'redirect', url: `${globalThis.location?.origin ?? ''}/me` });
    }
    case 'cancel-subscription':
      if (!db.subscription) return fail('NOT_FOUND', 'No active subscription.', 404);
      db.subscription.cancel_at_period_end = true;
      save(db);
      return json({ cancel_at_period_end: true });
    case 'delete-account':
      save(empty());
      return json({ deleted: true });
    default:
      return fail('NOT_FOUND', `No demo for ${name}`, 404);
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
function auth(db: Db, path: string, body: Row | null) {
  if (path === 'otp') return json({});
  if (path === 'verify') {
    if (body?.token !== DEMO_CODE) return json({ code: 'otp_expired', msg: `Demo code is ${DEMO_CODE}` }, 403);
    const email = String(body.email ?? 'you@demo.katori');
    if (!db.profile) {
      db.profile = {
        id: USER_ID,
        role: 'user',
        name: email
          .split('@')[0]!
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        katori_ml: 150,
        plate_size: 'medium',
        persona: 'hype_friend',
        savage_mode: false,
        adult_confirmed: false,
        locale: 'en',
        nudges_muted: false,
        onboarded_at: null,
      };
      save(db);
    }
    return json(session(email));
  }
  if (path === 'token') return json(session(String(db.profile?.name ?? 'you') + '@demo.katori'));
  if (path === 'user') return json(session('you@demo.katori').user);
  if (path === 'logout') return new Response(null, { status: 204 });
  return json({});
}

/** fetch() replacement handed to supabase-js in demo mode. */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  let body: Row | null = null;
  if (typeof init?.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body) as Row;
    } catch {
      body = null;
    }
  }
  const db = load();
  const [, area, ...rest_] = url.pathname.split('/');
  const sub = rest_.join('/');
  if (area === 'auth') return auth(db, sub.replace(/^v1\//, ''), body);
  if (area === 'rest') return rest(db, sub.replace(/^v1\//, ''), method, url.searchParams, headers, body);
  if (area === 'functions') return fn(db, sub.replace(/^v1\//, ''), body ?? {});
  if (area === 'storage') return json({ Key: sub, Id: crypto.randomUUID() });
  return json({});
}
