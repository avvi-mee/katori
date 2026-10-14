-- Phase 1 core tables (docs/ARCHITECTURE.md "Data model and security" + Build decisions).
-- RLS is enabled on every table in this file. Writes to meals, meal_items, user_dish_defaults,
-- coach_messages, usage, subscriptions, ai_cache and meal_drafts happen only via Edge Functions
-- using the service role (which bypasses RLS), so those tables get no insert/update policies.

-- ─── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'coach')),
  name text check (char_length(name) <= 80),
  sex text check (sex in ('male', 'female', 'other')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 300),
  goal text check (goal in ('fat_loss', 'muscle_gain', 'recomposition', 'strength', 'endurance', 'quit_smoking')),
  activity text check (activity in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  diet_type text check (diet_type in ('veg', 'egg', 'nonveg', 'jain')),
  kcal_target int check (kcal_target between 800 and 6000),
  protein_target int check (protein_target between 20 and 400),
  kcal_floor int check (kcal_floor between 800 and 4000),
  katori_ml int not null default 150 check (katori_ml between 50 and 400),
  plate_size text not null default 'medium' check (plate_size in ('small', 'medium', 'large')),
  persona text not null default 'hype_friend' check (persona in ('gym_bro', 'desi_mummy', 'strict_coach', 'hype_friend')),
  savage_mode boolean not null default false,
  adult_confirmed boolean not null default false,
  locale text not null default 'en' check (locale in ('en', 'hinglish')),
  nudges_muted boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Savage mode is off by default and needs an 18+ confirmation.
  constraint savage_needs_adult check (not savage_mode or adult_confirmed)
);

alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Users may edit their own profile, but never their role (coach accounts are granted server-side).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (
  name, sex, birth_year, height_cm, weight_kg, goal, activity, diet_type, kcal_target, protein_target,
  kcal_floor, katori_ml, plate_size, persona, savage_mode, adult_confirmed, locale, nudges_muted, onboarded_at
) on public.profiles to authenticated;

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── food_items (admin-written reference data) ───────────────────────────────
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  aliases text[] not null default '{}',
  cuisine text,
  region text,
  kind text not null check (kind in ('dish', 'ingredient', 'packaged')),
  units jsonb not null default '{}',
  density_g_per_ml numeric(4, 2) check (density_g_per_ml > 0),
  kcal_100g numeric(6, 1) not null check (kcal_100g >= 0),
  protein_100g numeric(5, 1) not null check (protein_100g >= 0),
  carbs_100g numeric(5, 1) not null check (carbs_100g >= 0),
  fat_100g numeric(5, 1) not null check (fat_100g >= 0),
  default_oil_g numeric(4, 1) not null default 0 check (default_oil_g >= 0),
  barcode text,
  source text not null check (source in ('IFCT', 'recipe', 'label')),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
comment on column public.food_items.units is
  '{"default": <unit>, "<unit>": grams per unit}. katori/glass/tbsp fall back to ml x density; plate scales with profiles.plate_size.';
comment on column public.food_items.default_oil_g is
  'Grams of oil/ghee per 100 g already included in the macros at home-normal level; the oil question scales this.';

create index food_items_name_trgm on public.food_items using gin (name extensions.gin_trgm_ops);

alter table public.food_items enable row level security;
-- Public nutrition data: readable by everyone (also used by Phase 3 SEO pages). No write policies.
create policy "food items readable" on public.food_items for select to anon, authenticated using (true);

-- Fuzzy dish lookup on name + aliases (trigram), used by analyze-meal / log-text.
create function public.match_food_item(q text, max_results int default 3)
returns table (id uuid, name text, score real)
language sql stable set search_path = public, extensions as $$
  select f.id, f.name, s.score
  from public.food_items f
  cross join lateral (
    select greatest(
      similarity(lower(f.name), lower(q)),
      coalesce((select max(similarity(lower(a), lower(q))) from unnest(f.aliases) a), 0)
    ) as score
  ) s
  where s.score > 0.25
  order by s.score desc, f.kind = 'dish' desc
  limit max_results;
$$;

-- ─── meals + meal_items ──────────────────────────────────────────────────────
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid unique, -- idempotency key from the offline outbox
  eaten_at timestamptz not null default now(),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  source text not null default 'home' check (source in ('home', 'outside')),
  photo_path text,
  input_mode text not null check (input_mode in ('photo', 'text', 'manual', 'telegram', 'whatsapp')),
  kcal numeric(7, 1) not null,
  kcal_low numeric(7, 1) not null,
  kcal_high numeric(7, 1) not null,
  protein_g numeric(6, 1) not null,
  carbs_g numeric(6, 1) not null,
  fat_g numeric(6, 1) not null,
  created_at timestamptz not null default now()
);
create index meals_user_eaten on public.meals (user_id, eaten_at desc);

alter table public.meals enable row level security;
create policy "own meals" on public.meals for select to authenticated using (auth.uid() = user_id);
-- Swipe-to-delete. Inserts/updates happen only inside confirm-meal (service role).
create policy "own meals delete" on public.meals for delete to authenticated using (auth.uid() = user_id);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_item_id uuid references public.food_items (id) on delete set null,
  dish text not null,
  unit text not null,
  qty numeric(6, 2) not null check (qty > 0),
  grams numeric(7, 1) not null check (grams >= 0),
  oil_level text check (oil_level in ('kam', 'normal', 'zyada')),
  oil_g numeric(5, 1) not null default 0,
  kcal numeric(7, 1) not null,
  protein_g numeric(6, 1) not null,
  carbs_g numeric(6, 1) not null,
  fat_g numeric(6, 1) not null,
  confidence numeric(3, 2),
  user_edited boolean not null default false
);
create index meal_items_meal on public.meal_items (meal_id);

alter table public.meal_items enable row level security;
create policy "own meal items" on public.meal_items for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid()));

-- ─── user_dish_defaults ("my usual") ─────────────────────────────────────────
create table public.user_dish_defaults (
  user_id uuid not null references auth.users (id) on delete cascade,
  food_item_id uuid not null references public.food_items (id) on delete cascade,
  unit text not null,
  qty numeric(6, 2) not null check (qty > 0),
  oil_level text check (oil_level in ('kam', 'normal', 'zyada')),
  times_used int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, food_item_id)
);
alter table public.user_dish_defaults enable row level security;
create policy "own dish defaults" on public.user_dish_defaults for select to authenticated using (auth.uid() = user_id);

-- ─── coach_messages ──────────────────────────────────────────────────────────
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  persona text not null,
  trigger text not null,
  text text not null,
  facts jsonb not null default '{}',
  delivered_via text not null default 'in_app' check (delivered_via in ('in_app', 'push')),
  created_at timestamptz not null default now()
);
create index coach_messages_user_day on public.coach_messages (user_id, day desc);
alter table public.coach_messages enable row level security;
create policy "own coach messages" on public.coach_messages for select to authenticated using (auth.uid() = user_id);

-- ─── weights ─────────────────────────────────────────────────────────────────
create table public.weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 1) not null check (weight_kg between 25 and 300),
  primary key (user_id, date)
);
alter table public.weights enable row level security;
create policy "own weights" on public.weights for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── usage (quotas) ──────────────────────────────────────────────────────────
create table public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  scans int not null default 0,
  text_logs int not null default 0,
  coach_messages int not null default 0,
  last_request_at timestamptz,
  primary key (user_id, day)
);
alter table public.usage enable row level security;
-- Readable so the app can show "1 free scan left today".
create policy "own usage" on public.usage for select to authenticated using (auth.uid() = user_id);

-- ─── subscriptions (single source of truth for Pro) ──────────────────────────
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'dodo', 'play', 'appstore')),
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null check (status in ('created', 'active', 'halted', 'cancelled', 'expired')),
  current_period_end timestamptz,
  provider_ref text unique,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "own subscription" on public.subscriptions for select to authenticated using (auth.uid() = user_id);

create function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
revoke execute on function public.is_pro(uuid) from public, anon, authenticated;

-- ─── ai_cache (service role only) ────────────────────────────────────────────
create table public.ai_cache (
  key text primary key,
  payload jsonb not null,
  hits int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;

-- ─── meal_drafts (analyze -> confirm; also feeds the scan_logs view) ─────────
create table public.meal_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  source text check (source in ('home', 'outside')),
  input_mode text not null check (input_mode in ('photo', 'text', 'manual', 'telegram', 'whatsapp')),
  photo_path text,
  items jsonb not null,
  questions jsonb not null,
  provider text,
  latency_ms int,
  cost_usd numeric(10, 6),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index meal_drafts_user_created on public.meal_drafts (user_id, created_at desc);
alter table public.meal_drafts enable row level security;
create policy "own drafts" on public.meal_drafts for select to authenticated using (auth.uid() = user_id);

-- ─── push_subscriptions (web push) ───────────────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Supabase Realtime for the Pro unlock (skipped where the publication doesn't exist, e.g. tests).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end $$;
