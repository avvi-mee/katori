-- AI latency and cost per scan, so the bill never surprises you (docs: Observability).
-- For the dashboard / service role only: revoked from app users. security_invoker keeps RLS of the base table.
create view public.scan_logs with (security_invoker = true) as
select
  d.id,
  d.user_id,
  d.created_at,
  d.input_mode,
  d.provider,
  d.latency_ms,
  d.cost_usd,
  jsonb_array_length(d.items) as items,
  jsonb_array_length(d.questions) as questions,
  d.consumed_at is not null as confirmed
from public.meal_drafts d;

create view public.scan_costs_daily with (security_invoker = true) as
select
  (created_at at time zone 'Asia/Kolkata')::date as day,
  provider,
  input_mode,
  count(*) as scans,
  count(*) filter (where confirmed) as confirmed,
  round(avg(latency_ms)) as avg_latency_ms,
  percentile_disc(0.75) within group (order by latency_ms) as p75_latency_ms,
  round(sum(coalesce(cost_usd, 0))::numeric, 4) as cost_usd
from public.scan_logs
group by 1, 2, 3;

revoke all on public.scan_logs, public.scan_costs_daily from anon, authenticated;
