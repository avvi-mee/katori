-- Phase 1B: training, activity, habit, goal and body tables (docs/ARCHITECTURE.md "Training, activity and
-- habit tables (v3)" + Build decisions). RLS is enabled on every table in this file. Policies are owner-only
-- for now; Phase 2 adds "coach reads active clients" policies next to these (see the meals example policy).
-- Ids of user-written rows are generated on the device, so offline replays upsert with ON CONFLICT DO NOTHING.

-- ─── profiles.preferences (validated by src/types/preferences.ts) ────────────
alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb
  constraint preferences_is_object check (jsonb_typeof(preferences) = 'object');
grant update (preferences) on public.profiles to authenticated;

-- ─── exercises (library rows have owner_id null; custom rows belong to a user) ─
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique, -- free-exercise-db id for library rows; null for custom exercises
  name text not null check (char_length(name) between 1 and 120),
  aliases text[] not null default '{}',
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text,
  mechanic text check (mechanic in ('compound', 'isolation')),
  force text check (force in ('push', 'pull', 'static')),
  level text check (level in ('beginner', 'intermediate', 'expert')),
  category text not null default 'strength'
    check (category in ('strength', 'stretching', 'plyometrics', 'strongman', 'powerlifting', 'cardio', 'olympic_weightlifting')),
  instructions text[] not null default '{}',
  images text[] not null default '{}',
  source text not null default 'custom' check (source in ('free-exercise-db', 'katori', 'custom')),
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint custom_has_owner check ((source = 'custom') = (owner_id is not null))
);
create index exercises_name_trgm on public.exercises using gin (name extensions.gin_trgm_ops);
create index exercises_owner on public.exercises (owner_id) where owner_id is not null;

alter table public.exercises enable row level security;
create policy "library and own exercises" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy "own custom exercises insert" on public.exercises for insert to authenticated
  with check (owner_id = auth.uid() and source = 'custom');
create policy "own custom exercises update" on public.exercises for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and source = 'custom');
create policy "own custom exercises delete" on public.exercises for delete to authenticated
  using (owner_id = auth.uid());

-- ─── workout_templates + template_exercises (owner_id null = Katori library) ──
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  split text check (split in ('ppl', 'upper_lower', 'bro', 'full_body', 'custom')),
  notes text check (char_length(notes) <= 1000),
  assigned_by_coach_id uuid references auth.users (id) on delete set null, -- Phase 2
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_templates_owner on public.workout_templates (owner_id);
create trigger workout_templates_updated_at before update on public.workout_templates
  for each row execute function public.set_updated_at();

alter table public.workout_templates enable row level security;
create policy "library and own templates" on public.workout_templates for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy "own templates insert" on public.workout_templates for insert to authenticated
  with check (owner_id = auth.uid());
create policy "own templates update" on public.workout_templates for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own templates delete" on public.workout_templates for delete to authenticated
  using (owner_id = auth.uid());

create table public.template_exercises (
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  position int not null check (position >= 0),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  sets int not null default 3 check (sets between 1 and 20),
  rep_min int not null default 8 check (rep_min between 1 and 100),
  rep_max int not null default 12 check (rep_max between 1 and 100),
  rest_s int not null default 90 check (rest_s between 0 and 900),
  primary key (template_id, position),
  constraint rep_range check (rep_min <= rep_max)
);

alter table public.template_exercises enable row level security;
create policy "template exercises readable with template" on public.template_exercises for select to authenticated
  using (exists (
    select 1 from public.workout_templates t
    where t.id = template_id and (t.owner_id is null or t.owner_id = auth.uid())
  ));
create policy "own template exercises write" on public.template_exercises for all to authenticated
  using (exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.workout_templates t where t.id = template_id and t.owner_id = auth.uid()));

-- ─── workouts + workout_sets ─────────────────────────────────────────────────
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.workout_templates (id) on delete set null,
  name text check (char_length(name) <= 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_s int check (duration_s between 0 and 86400),
  volume_kg numeric(10, 1) check (volume_kg >= 0),
  notes text check (char_length(notes) <= 2000),
  kcal_low int check (kcal_low >= 0),
  kcal_high int check (kcal_high >= 0),
  created_at timestamptz not null default now()
);
create index workouts_user_started on public.workouts (user_id, started_at desc);

alter table public.workouts enable row level security;
create policy "own workouts" on public.workouts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  -- Deferred: account deletion cascades workouts and custom exercises in one go; deleting a custom exercise
  -- that has history still fails at commit.
  exercise_id uuid not null references public.exercises (id) deferrable initially deferred,
  set_no int not null check (set_no between 1 and 100),
  kind text not null default 'working' check (kind in ('warmup', 'working', 'drop', 'failure')),
  kg numeric(6, 2) check (kg between 0 and 1000),
  reps int check (reps between 0 and 1000),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  superset_group int check (superset_group between 1 and 50),
  -- cardio machines inside workouts (treadmill, cycle, cross-trainer)
  duration_s int check (duration_s between 0 and 86400),
  distance_m int check (distance_m between 0 and 1000000),
  done_at timestamptz not null default now()
);
create index workout_sets_workout on public.workout_sets (workout_id);
create index workout_sets_exercise_done on public.workout_sets (exercise_id, done_at);

alter table public.workout_sets enable row level security;
create policy "own workout sets" on public.workout_sets for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));

-- ─── personal_records (written only by the PR trigger; see the next migration) ─
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  kind text not null check (kind in ('weight', 'reps', 'e1rm', 'volume')),
  value numeric(10, 2) not null,
  kg numeric(6, 2), -- the weight of the set (reps PRs are "best reps at this weight")
  reps int,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  set_id uuid references public.workout_sets (id) on delete cascade,
  achieved_at timestamptz not null default now()
);
create index personal_records_user_exercise on public.personal_records (user_id, exercise_id, kind);
create unique index personal_records_set_kind on public.personal_records (set_id, kind) where kind <> 'volume';
create unique index personal_records_volume on public.personal_records (workout_id, exercise_id) where kind = 'volume';

alter table public.personal_records enable row level security;
create policy "own personal records" on public.personal_records for select to authenticated
  using (auth.uid() = user_id);

-- ─── activity_days + runs ────────────────────────────────────────────────────
create table public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  steps int not null default 0 check (steps between 0 and 200000),
  source text not null default 'manual' check (source in ('manual', 'health_connect', 'healthkit')),
  active_kcal int check (active_kcal between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.activity_days enable row level security;
create policy "own activity days" on public.activity_days for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'run' check (kind in ('run', 'walk', 'cycle')),
  started_at timestamptz not null default now(),
  distance_m int not null check (distance_m between 1 and 500000),
  duration_s int not null check (duration_s between 1 and 86400),
  route jsonb, -- GeoJSON, Phase 4 native GPS
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index runs_user_started on public.runs (user_id, started_at desc);
alter table public.runs enable row level security;
create policy "own runs" on public.runs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── habits + habit_logs ─────────────────────────────────────────────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('smoking', 'water', 'sleep', 'alcohol', 'junk', 'sugar', 'custom')),
  name text not null check (char_length(name) between 1 and 60),
  unit text not null default 'count' check (char_length(unit) <= 20),
  daily_target numeric(8, 2) check (daily_target >= 0), -- goal (water, sleep) or limit (smoking, alcohol, junk)
  baseline_per_day numeric(6, 2) check (baseline_per_day >= 0), -- smoking: cigarettes/day before tracking
  price_per_unit numeric(8, 2) check (price_per_unit >= 0), -- smoking: ₹ per cigarette
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index habits_user on public.habits (user_id);
alter table public.habits enable row level security;
create policy "own habits" on public.habits for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  logged_at timestamptz not null default now(),
  value numeric(8, 2) not null default 1 check (value >= 0),
  trigger text check (trigger in ('stress', 'chai', 'after_food', 'friends', 'boredom', 'alcohol', 'other')),
  note text check (char_length(note) <= 500)
);
create index habit_logs_habit_logged on public.habit_logs (habit_id, logged_at desc);
alter table public.habit_logs enable row level security;
create policy "own habit logs" on public.habit_logs for all to authenticated
  using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

-- ─── goals (one row per user; null = use the computed default) ───────────────
create table public.goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  primary_goal text check (primary_goal in ('fat_loss', 'muscle_gain', 'recomposition', 'strength', 'endurance', 'quit_smoking')),
  kcal int check (kcal between 800 and 6000),
  protein_g int check (protein_g between 20 and 400),
  workouts_per_week int check (workouts_per_week between 0 and 7),
  steps int check (steps between 0 and 100000),
  water_ml int check (water_ml between 0 and 10000),
  sleep_h numeric(3, 1) check (sleep_h between 0 and 14),
  smoking_limit int check (smoking_limit between 0 and 100),
  updated_by text not null default 'user' check (updated_by in ('user', 'engine', 'coach')),
  updated_at timestamptz not null default now()
);
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
alter table public.goals enable row level security;
create policy "own goals" on public.goals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── body_logs (weight itself lives in `weights`; see Build decisions) ───────
create table public.body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 1) check (weight_kg between 25 and 300),
  waist_cm numeric(5, 1) check (waist_cm between 30 and 250),
  chest_cm numeric(5, 1) check (chest_cm between 30 and 250),
  arm_cm numeric(5, 1) check (arm_cm between 10 and 100),
  thigh_cm numeric(5, 1) check (thigh_cm between 20 and 150),
  photo_path text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.body_logs enable row level security;
create policy "own body logs" on public.body_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private progress photos: body-photos/{user_id}/...  Served only via short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('body-photos', 'body-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "own body photos read" on storage.objects for select to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own body photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own body photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
