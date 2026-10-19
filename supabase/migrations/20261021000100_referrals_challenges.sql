-- Phase 3 reach: referrals ("both get one free month") and the 30-day protein challenge with a group
-- leaderboard. Rows are written only by the security-definer functions here; RLS lets people read their own.

-- ─── Free Pro time (referral rewards; is_pro honours it) ─────────────────────
create table public.pro_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  until timestamptz not null,
  reason text not null check (reason in ('referral', 'referred')),
  created_at timestamptz not null default now()
);
create index pro_grants_user on public.pro_grants (user_id, until desc);
alter table public.pro_grants enable row level security;
create policy "own grants" on public.pro_grants for select to authenticated using (user_id = auth.uid());

/** Adds `days` of Pro, stacking after any grant that is still running. */
create function public.grant_pro_days(uid uuid, days int, why text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_from timestamptz;
begin
  select greatest(now(), coalesce(max(until), now())) into v_from from public.pro_grants where user_id = uid;
  insert into public.pro_grants (user_id, until, reason) values (uid, v_from + make_interval(days => days), why);
end $$;
revoke execute on function public.grant_pro_days(uuid, int, text) from public, anon, authenticated;

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
  ) or exists (select 1 from public.pro_grants g where g.user_id = uid and g.until > now());
$$;
revoke execute on function public.is_pro(uuid) from public, anon, authenticated;

-- my_pro_status also reports free time from referrals.
drop function public.my_pro_status();
create function public.my_pro_status() returns table (pro boolean, sponsored_by text, free_until timestamptz)
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
     limit 1),
    (select max(g.until) from public.pro_grants g where g.user_id = auth.uid() and g.until > now());
$$;
revoke execute on function public.my_pro_status() from public, anon;
grant execute on function public.my_pro_status() to authenticated;

-- ─── Referrals ───────────────────────────────────────────────────────────────
alter table public.profiles add column referral_code text unique check (referral_code ~ '^[A-Z0-9]{8}$');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referee_id uuid not null unique references auth.users (id) on delete cascade, -- one referrer per person, ever
  status text not null default 'pending' check (status in ('pending', 'rewarded', 'rejected')),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  constraint not_self check (referrer_id <> referee_id)
);
create index referrals_referrer on public.referrals (referrer_id, status);
alter table public.referrals enable row level security;
create policy "own referrals" on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referee_id = auth.uid());

create function public.random_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

/** The caller's referral code (created on first use). */
create function public.my_referral_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  select referral_code into v_code from public.profiles where id = auth.uid();
  while v_code is null loop
    begin
      update public.profiles set referral_code = public.random_code() where id = auth.uid()
      returning referral_code into v_code;
      if not found then raise exception 'no profile' using errcode = 'P0002'; end if;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  return v_code;
end $$;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

create function public.referral_preview(code text) returns text
language sql stable security definer set search_path = '' as $$
  select split_part(coalesce(name, 'A friend'), ' ', 1) from public.profiles where referral_code = upper(code);
$$;
revoke execute on function public.referral_preview(text) from public;
grant execute on function public.referral_preview(text) to anon, authenticated;

/**
 * A new user (account under 14 days old, never referred) claims a friend's code. The reward waits until they
 * have logged 3 meals; each referrer earns at most 12 rewards a year.
 */
create function public.redeem_referral(code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_referrer uuid;
  v_name text;
  v_created timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select id, split_part(coalesce(name, 'A friend'), ' ', 1) into v_referrer, v_name
  from public.profiles where referral_code = upper(code);
  if v_referrer is null then raise exception 'code not found' using errcode = 'P0002'; end if;
  if v_referrer = auth.uid() then raise exception 'cannot refer yourself' using errcode = '22023'; end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created < now() - interval '14 days' then raise exception 'referrals are for new accounts' using errcode = '22023'; end if;
  if exists (select 1 from public.referrals where referee_id = auth.uid()) then
    raise exception 'already referred' using errcode = '23505';
  end if;
  insert into public.referrals (referrer_id, referee_id) values (v_referrer, auth.uid());
  return v_name;
end $$;
revoke execute on function public.redeem_referral(text) from public, anon;
grant execute on function public.redeem_referral(text) to authenticated;

/** On the referee's 3rd meal: one free month each (the referrer's capped at 12 a year). */
create function public.reward_referral() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref public.referrals;
begin
  select * into v_ref from public.referrals where referee_id = new.user_id and status = 'pending' for update;
  if v_ref.id is null then return new; end if;
  if (select count(*) from public.meals where user_id = new.user_id) < 3 then return new; end if;
  perform public.grant_pro_days(v_ref.referee_id, 30, 'referred');
  if (select count(*) from public.referrals
      where referrer_id = v_ref.referrer_id and status = 'rewarded' and rewarded_at > now() - interval '365 days') < 12 then
    perform public.grant_pro_days(v_ref.referrer_id, 30, 'referral');
  end if;
  update public.referrals set status = 'rewarded', rewarded_at = now() where id = v_ref.id;
  return new;
end $$;
revoke execute on function public.reward_referral() from public, anon, authenticated;
create trigger meals_reward_referral after insert on public.meals
  for each row execute function public.reward_referral();

-- ─── Challenges: 30-day protein challenge ────────────────────────────────────
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'protein_30' check (kind in ('protein_30')),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now(),
  constraint thirty_days check (ends_on = starts_on + 29)
);
create table public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index challenge_members_user on public.challenge_members (user_id);

create function public.is_challenge_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenge_members where challenge_id = cid and user_id = auth.uid());
$$;
revoke execute on function public.is_challenge_member(uuid) from public, anon;
grant execute on function public.is_challenge_member(uuid) to authenticated;

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
create policy "members read challenge" on public.challenges for select to authenticated
  using (public.is_challenge_member(id));
create policy "members read members" on public.challenge_members for select to authenticated
  using (public.is_challenge_member(challenge_id));

create function public.create_challenge(challenge_name text, start_day date, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if start_day < (now() at time zone 'utc' + interval '330 minutes')::date - 1 then
    raise exception 'start today or later' using errcode = '22023';
  end if;
  loop
    begin
      insert into public.challenges (name, starts_on, ends_on, created_by, invite_code)
      values (trim(challenge_name), start_day, start_day + 29, auth.uid(), public.random_code())
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- new code
    end;
  end loop;
  insert into public.challenge_members (challenge_id, user_id, display_name) values (v_id, auth.uid(), trim(display_name));
  return v_id;
end $$;
revoke execute on function public.create_challenge(text, date, text) from public, anon;
grant execute on function public.create_challenge(text, date, text) to authenticated;

create function public.challenge_preview(code text) returns table (name text, starts_on date, members int)
language sql stable security definer set search_path = '' as $$
  select c.name, c.starts_on, (select count(*)::int from public.challenge_members m where m.challenge_id = c.id)
  from public.challenges c where c.invite_code = upper(code);
$$;
revoke execute on function public.challenge_preview(text) from public;
grant execute on function public.challenge_preview(text) to anon, authenticated;

/** Join by invite code until the challenge ends; groups are capped at 50. */
create function public.join_challenge(code text, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.challenges;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_c from public.challenges where invite_code = upper(code);
  if v_c.id is null then raise exception 'challenge not found' using errcode = 'P0002'; end if;
  if v_c.ends_on < (now() at time zone 'utc' + interval '330 minutes')::date then
    raise exception 'challenge is over' using errcode = '22023';
  end if;
  if (select count(*) from public.challenge_members where challenge_id = v_c.id) >= 50 then
    raise exception 'challenge is full' using errcode = '22023';
  end if;
  insert into public.challenge_members (challenge_id, user_id, display_name)
  values (v_c.id, auth.uid(), trim(display_name)) on conflict do nothing;
  return v_c.id;
end $$;
revoke execute on function public.join_challenge(text, text) from public, anon;
grant execute on function public.join_challenge(text, text) to authenticated;

create function public.leave_challenge(cid uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.challenge_members where challenge_id = cid and user_id = auth.uid();
$$;
revoke execute on function public.leave_challenge(uuid) from public, anon;
grant execute on function public.leave_challenge(uuid) to authenticated;

/**
 * Leaderboard for members only: protein-goal days so far (IST days with logged protein ≥ that member's own
 * target). Shares counts, never meals or targets.
 */
create function public.challenge_leaderboard(cid uuid)
returns table (user_id uuid, display_name text, days_hit int, days_logged int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.challenges;
  v_today date := (now() at time zone 'utc' + interval '330 minutes')::date;
begin
  if not public.is_challenge_member(cid) then raise exception 'members only' using errcode = '42501'; end if;
  select * into v_c from public.challenges where id = cid;
  return query
  with days as (
    select m.user_id, (ml.eaten_at at time zone 'utc' + interval '330 minutes')::date as d, sum(ml.protein_g) as protein
    from public.challenge_members m
    join public.meals ml on ml.user_id = m.user_id
    where m.challenge_id = cid
      and (ml.eaten_at at time zone 'utc' + interval '330 minutes')::date between v_c.starts_on and least(v_c.ends_on, v_today)
    group by 1, 2
  )
  select m.user_id, m.display_name,
    count(*) filter (where d.protein >= coalesce(g.protein_g, p.protein_target, 100))::int,
    count(d.d)::int,
    m.user_id = auth.uid()
  from public.challenge_members m
  join public.profiles p on p.id = m.user_id
  left join public.goals g on g.user_id = m.user_id
  left join days d on d.user_id = m.user_id
  where m.challenge_id = cid
  group by m.user_id, m.display_name, g.protein_g, p.protein_target
  order by 3 desc, 4 desc, m.display_name;
end $$;
revoke execute on function public.challenge_leaderboard(uuid) from public, anon;
grant execute on function public.challenge_leaderboard(uuid) to authenticated;
