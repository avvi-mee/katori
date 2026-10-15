-- Atomic usage counters for quotas and the 1-request-per-3-seconds rate limit.
-- Called only by Edge Functions with the service role.
create function public.bump_usage(
  p_user uuid,
  p_day date,
  p_scans int default 0,
  p_text_logs int default 0,
  p_coach_messages int default 0
) returns void
language sql security definer set search_path = '' as $$
  insert into public.usage as u (user_id, day, scans, text_logs, coach_messages, last_request_at)
  values (p_user, p_day, p_scans, p_text_logs, p_coach_messages, now())
  on conflict (user_id, day) do update set
    scans = u.scans + excluded.scans,
    text_logs = u.text_logs + excluded.text_logs,
    coach_messages = u.coach_messages + excluded.coach_messages,
    last_request_at = now();
$$;

revoke execute on function public.bump_usage(uuid, date, int, int, int) from public, anon, authenticated;
