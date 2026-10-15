-- One-tap cancel keeps Pro until the paid period ends; the app shows "Cancels on <date>".
alter table public.subscriptions add column cancel_at_period_end boolean not null default false;
