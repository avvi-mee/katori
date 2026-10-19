-- Personal records (docs/ARCHITECTURE.md "Workout tracker"): detected in the database when a set is inserted,
-- so they are correct whichever device or offline replay wrote the set. personal_records has no write policy;
-- only this security-definer trigger writes it.
-- A PR needs history to beat: the very first working set of an exercise is a baseline, not a record.
create function public.detect_personal_records() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_prev_weight numeric;
  v_prev_reps int;
  v_prev_e1rm numeric;
  v_prev_volume numeric;
  v_volume numeric;
  v_e1rm numeric;
  v_has_history boolean;
begin
  if new.kind = 'warmup' or new.kg is null or new.reps is null or new.reps <= 0 or new.kg <= 0 then
    return new;
  end if;
  select w.user_id into v_user from public.workouts w where w.id = new.workout_id;

  -- History = this user's earlier working sets of the exercise, in other workouts or earlier in this one.
  select
    count(*) > 0,
    max(s.kg),
    max(s.reps) filter (where s.kg = new.kg),
    max(s.kg * (1 + s.reps / 30.0))
  into v_has_history, v_prev_weight, v_prev_reps, v_prev_e1rm
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  where w.user_id = v_user
    and s.exercise_id = new.exercise_id
    and s.id <> new.id
    and s.kind <> 'warmup'
    and s.kg is not null and s.reps is not null and s.reps > 0;

  if not v_has_history then
    return new;
  end if;

  v_e1rm := round(new.kg * (1 + new.reps / 30.0), 2);

  if new.kg > coalesce(v_prev_weight, 0) then
    insert into public.personal_records (user_id, exercise_id, kind, value, kg, reps, workout_id, set_id, achieved_at)
    values (v_user, new.exercise_id, 'weight', new.kg, new.kg, new.reps, new.workout_id, new.id, new.done_at)
    on conflict do nothing;
  end if;

  if v_prev_reps is not null and new.reps > v_prev_reps then
    insert into public.personal_records (user_id, exercise_id, kind, value, kg, reps, workout_id, set_id, achieved_at)
    values (v_user, new.exercise_id, 'reps', new.reps, new.kg, new.reps, new.workout_id, new.id, new.done_at)
    on conflict do nothing;
  end if;

  if v_e1rm > coalesce(v_prev_e1rm, 0) then
    insert into public.personal_records (user_id, exercise_id, kind, value, kg, reps, workout_id, set_id, achieved_at)
    values (v_user, new.exercise_id, 'e1rm', v_e1rm, new.kg, new.reps, new.workout_id, new.id, new.done_at)
    on conflict do nothing;
  end if;

  -- Session volume: this workout's total for the exercise vs the best total of any earlier workout.
  select coalesce(sum(s.kg * s.reps), 0) into v_volume
  from public.workout_sets s
  where s.workout_id = new.workout_id and s.exercise_id = new.exercise_id
    and s.kind <> 'warmup' and s.kg is not null and s.reps is not null;

  select max(t.vol) into v_prev_volume from (
    select sum(s.kg * s.reps) as vol
    from public.workout_sets s
    join public.workouts w on w.id = s.workout_id
    where w.user_id = v_user and s.exercise_id = new.exercise_id and s.workout_id <> new.workout_id
      and s.kind <> 'warmup' and s.kg is not null and s.reps is not null
    group by s.workout_id
  ) t;

  if v_prev_volume is not null and v_volume > v_prev_volume then
    insert into public.personal_records (user_id, exercise_id, kind, value, workout_id, achieved_at)
    values (v_user, new.exercise_id, 'volume', v_volume, new.workout_id, new.done_at)
    on conflict (workout_id, exercise_id) where kind = 'volume'
    do update set value = excluded.value, achieved_at = excluded.achieved_at;
  end if;

  return new;
end $$;

revoke execute on function public.detect_personal_records() from public, anon, authenticated;

create trigger workout_sets_personal_records after insert on public.workout_sets
  for each row execute function public.detect_personal_records();
