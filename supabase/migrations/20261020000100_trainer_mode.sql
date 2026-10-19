-- Phase 2: trainer mode (docs/ARCHITECTURE.md "Trainer mode" + "Trainer billing").
-- A coach reads an ACTIVE client's data (never ended, invited or other clients) and may comment on meals,
-- set targets and assign workout plans. Links are created and ended only through the security-definer
-- functions below; coach_clients and coach_billing have no write policies.

-- ─── coach_clients ───────────────────────────────────────────────────────────
create table public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references auth.users (id) on delete cascade, -- null until the invite is accepted
  status text not null default 'invited' check (status in ('invited', 'active', 'ended')),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint not_self check (client_id is null or client_id <> coach_id),
  constraint active_has_client check (status <> 'active' or client_id is not null)
);
-- A client has at most one active trainer.
create unique index coach_clients_one_active on public.coach_clients (client_id) where status = 'active';
create index coach_clients_coach on public.coach_clients (coach_id, status);

alter table public.coach_clients enable row level security;
create policy "coach sees own links" on public.coach_clients for select to authenticated
  using (coach_id = auth.uid());
create policy "client sees own links" on public.coach_clients for select to authenticated
  using (client_id = auth.uid());

/** True when the caller is the active coach of `client`. Used by every coach read policy. */
create function public.is_coach_of(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.coach_clients cc
    where cc.coach_id = auth.uid() and cc.client_id = client and cc.status = 'active'
  );
$$;
revoke execute on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;

-- ─── Becoming a coach, inviting, accepting, leaving ──────────────────────────
create function public.become_coach(display_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if char_length(trim(coalesce(display_name, ''))) not between 2 and 60 then
    raise exception 'name must be 2-60 characters' using errcode = '22023';
  end if;
  -- Coaches skip the personal onboarding (they can fill in their own targets later from Me).
  update public.profiles set role = 'coach', name = trim(display_name), onboarded_at = coalesce(onboarded_at, now())
  where id = auth.uid();
end $$;
revoke execute on function public.become_coach(text) from public, anon;
grant execute on function public.become_coach(text) to authenticated;

-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I).
create function public.create_coach_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'coaches only' using errcode = '42501';
  end if;
  -- Reuse an open invite instead of piling up unused codes.
  select invite_code into v_code from public.coach_clients
  where coach_id = auth.uid() and status = 'invited' order by created_at desc limit 1;
  if v_code is not null then return v_code; end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code from generate_series(1, 8);
    begin
      insert into public.coach_clients (coach_id, invite_code) values (auth.uid(), v_code);
      return v_code;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end $$;
revoke execute on function public.create_coach_invite() from public, anon;
grant execute on function public.create_coach_invite() to authenticated;

/** What the consent screen shows before accepting (callable signed out, reveals only the coach's name). */
create function public.coach_invite_preview(code text) returns table (coach_name text, valid boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.name, 'Your coach'), cc.status = 'invited'
  from public.coach_clients cc join public.profiles p on p.id = cc.coach_id
  where cc.invite_code = upper(code);
$$;
revoke execute on function public.coach_invite_preview(text) from public;
grant execute on function public.coach_invite_preview(text) to anon, authenticated;

/**
 * Explicit consent: the client accepts an invite. Ends any other active link (one trainer at a time) and
 * leaves a fresh open invite for the coach's next client.
 */
create function public.accept_coach_invite(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.coach_clients;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_link from public.coach_clients where invite_code = upper(code) for update;
  if v_link.id is null or v_link.status <> 'invited' then
    raise exception 'invite not found or already used' using errcode = 'P0002';
  end if;
  if v_link.coach_id = auth.uid() then raise exception 'cannot coach yourself' using errcode = '22023'; end if;
  update public.coach_clients set status = 'ended', ended_at = now()
  where client_id = auth.uid() and status = 'active';
  update public.coach_clients set client_id = auth.uid(), status = 'active', started_at = now()
  where id = v_link.id;
  return v_link.id;
end $$;
revoke execute on function public.accept_coach_invite(text) from public, anon;
grant execute on function public.accept_coach_invite(text) to authenticated;

/** Either side ends the link; access stops immediately (every policy checks status = 'active'). */
create function public.end_coach_link(link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.coach_clients set status = 'ended', ended_at = now()
  where id = link and status in ('active', 'invited') and (client_id = auth.uid() or coach_id = auth.uid());
  if not found then raise exception 'link not found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.end_coach_link(uuid) from public, anon;
grant execute on function public.end_coach_link(uuid) to authenticated;

/** The caller's active trainer, if any (clients can't read coach profiles directly). */
create function public.my_coach() returns table (link_id uuid, coach_id uuid, coach_name text, started_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select cc.id, cc.coach_id, coalesce(p.name, 'Your coach'), cc.started_at
  from public.coach_clients cc join public.profiles p on p.id = cc.coach_id
  where cc.client_id = auth.uid() and cc.status = 'active';
$$;
revoke execute on function public.my_coach() from public, anon;
grant execute on function public.my_coach() to authenticated;

-- ─── Coach read access to active clients ─────────────────────────────────────
create policy "coach reads active clients" on public.profiles for select to authenticated using (public.is_coach_of(id));
create policy "coach reads active clients" on public.meals for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.meal_items for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and public.is_coach_of(m.user_id)));
create policy "coach reads active clients" on public.weights for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.workouts for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.workout_sets for select to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and public.is_coach_of(w.user_id)));
create policy "coach reads active clients" on public.personal_records for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.activity_days for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.runs for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.habits for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.habit_logs for select to authenticated
  using (exists (select 1 from public.habits h where h.id = habit_id and public.is_coach_of(h.user_id)));
create policy "coach reads active clients" on public.body_logs for select to authenticated using (public.is_coach_of(user_id));
create policy "coach reads active clients" on public.goals for select to authenticated using (public.is_coach_of(user_id));
-- Custom exercises a client logged, so the coach can name them.
create policy "coach reads active clients" on public.exercises for select to authenticated using (public.is_coach_of(owner_id));
-- Meal photos (not body photos: those stay private to the user).
create policy "coach reads active clients meal photos" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and public.is_coach_of(((storage.foldername(name))[1])::uuid));

-- Coaches set targets (goals.updated_by = 'coach'); the client still owns and can change them.
create policy "coach sets client targets" on public.goals for insert to authenticated
  with check (public.is_coach_of(user_id) and updated_by = 'coach');
create policy "coach updates client targets" on public.goals for update to authenticated
  using (public.is_coach_of(user_id)) with check (public.is_coach_of(user_id) and updated_by = 'coach');

-- ─── Assigned workout plans ──────────────────────────────────────────────────
-- A plan is a template owned by the client, assigned_by_coach_id = the coach, scheduled on plan_weekdays.
alter table public.workout_templates
  add column plan_weekdays int[] check (plan_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]);
create policy "coach reads assigned plans" on public.workout_templates for select to authenticated
  using (assigned_by_coach_id = auth.uid() and public.is_coach_of(owner_id));
create policy "coach assigns plans" on public.workout_templates for insert to authenticated
  with check (assigned_by_coach_id = auth.uid() and public.is_coach_of(owner_id));
create policy "coach edits assigned plans" on public.workout_templates for update to authenticated
  using (assigned_by_coach_id = auth.uid() and public.is_coach_of(owner_id))
  with check (assigned_by_coach_id = auth.uid() and public.is_coach_of(owner_id));
create policy "coach removes assigned plans" on public.workout_templates for delete to authenticated
  using (assigned_by_coach_id = auth.uid() and public.is_coach_of(owner_id));
create policy "coach writes assigned plan exercises" on public.template_exercises for all to authenticated
  using (exists (select 1 from public.workout_templates t
    where t.id = template_id and t.assigned_by_coach_id = auth.uid() and public.is_coach_of(t.owner_id)))
  with check (exists (select 1 from public.workout_templates t
    where t.id = template_id and t.assigned_by_coach_id = auth.uid() and public.is_coach_of(t.owner_id)));

-- ─── meal_comments ───────────────────────────────────────────────────────────
create table public.meal_comments (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text check (char_length(body) <= 1000),
  reaction text check (reaction in ('great', 'protein', 'portion', 'oil', 'veggies')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint has_content check (body is not null or reaction is not null)
);
create index meal_comments_meal on public.meal_comments (meal_id, created_at);
alter table public.meal_comments enable row level security;
-- Written by coach-comment (service role) after it checks the link. The meal's owner reads all comments on
-- their meals and may mark them read; a coach reads comments on meals they can still see.
create policy "owner reads comments" on public.meal_comments for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid()));
create policy "coach reads comments" on public.meal_comments for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and public.is_coach_of(m.user_id)));
create policy "owner marks comments read" on public.meal_comments for update to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid()));
revoke insert, update, delete on public.meal_comments from anon, authenticated;
grant update (read_at) on public.meal_comments to authenticated;

-- ─── coach_billing (written monthly by daily-digest) ─────────────────────────
create table public.coach_billing (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  active_clients int not null check (active_clients >= 0),
  amount int not null check (amount >= 0), -- rupees
  status text not null default 'due' check (status in ('due', 'covered', 'unpaid')),
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (coach_id, period)
);
alter table public.coach_billing enable row level security;
create policy "coach reads own billing" on public.coach_billing for select to authenticated using (coach_id = auth.uid());

-- ─── Coach subscriptions: ₹99 × active clients; their clients get Pro ────────
alter table public.subscriptions drop constraint subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('monthly', 'yearly', 'coach'));
alter table public.subscriptions add column quantity int not null default 1 check (quantity between 1 and 1000);

create or replace function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
      and (
        s.user_id = uid
        or (s.plan = 'coach' and exists (
          select 1 from public.coach_clients cc
          where cc.coach_id = s.user_id and cc.client_id = uid and cc.status = 'active'
        ))
      )
  );
$$;
revoke execute on function public.is_pro(uuid) from public, anon, authenticated;

/** The caller's own Pro status and, when it comes from a trainer, the trainer's name (for the Me screen). */
create function public.my_pro_status() returns table (pro boolean, sponsored_by text)
language sql stable security definer set search_path = '' as $$
  select public.is_pro(auth.uid()),
    (select p.name from public.coach_clients cc
       join public.subscriptions s on s.user_id = cc.coach_id and s.plan = 'coach' and s.status = 'active'
         and (s.current_period_end is null or s.current_period_end > now())
       join public.profiles p on p.id = cc.coach_id
     where cc.client_id = auth.uid() and cc.status = 'active'
       and not exists (
         select 1 from public.subscriptions own where own.user_id = auth.uid() and own.status = 'active'
           and (own.current_period_end is null or own.current_period_end > now())
       )
     limit 1);
$$;
revoke execute on function public.my_pro_status() from public, anon;
grant execute on function public.my_pro_status() to authenticated;

/** Pro users among a batch (daily-digest). */
create function public.pro_user_ids(ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u from unnest(ids) as u where public.is_pro(u);
$$;
revoke execute on function public.pro_user_ids(uuid[]) from public, anon, authenticated;
