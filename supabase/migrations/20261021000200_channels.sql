-- Phase 3: Telegram bot (docs/ARCHITECTURE.md "Channels"). The app makes a one-time code; the user sends
-- /start CODE to the bot; telegram-webhook (service role) links the chat to the account in channel_links.

create table public.channel_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  external_id text not null check (char_length(external_id) between 1 and 64),
  verified_at timestamptz not null default now(),
  primary key (channel, external_id),
  unique (user_id, channel)
);
alter table public.channel_links enable row level security;
create policy "own channel links" on public.channel_links for select to authenticated using (user_id = auth.uid());
-- Unlinking is the user's call; linking only happens in telegram-webhook.
create policy "own channel unlink" on public.channel_links for delete to authenticated using (user_id = auth.uid());

create table public.channel_link_codes (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.channel_link_codes enable row level security; -- no policies: service role only

/** A fresh 15-minute code for the deep link t.me/<bot>?start=CODE (replaces any earlier one). */
create function public.create_channel_link_code(ch text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if ch not in ('telegram', 'whatsapp') then raise exception 'unknown channel' using errcode = '22023'; end if;
  delete from public.channel_link_codes where user_id = auth.uid() and channel = ch;
  loop
    begin
      insert into public.channel_link_codes (code, user_id, channel) values (public.random_code(), auth.uid(), ch)
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      -- try again
    end;
  end loop;
end $$;
revoke execute on function public.create_channel_link_code(text) from public, anon;
grant execute on function public.create_channel_link_code(text) to authenticated;

-- Portion answers collected one inline-button tap at a time before confirm-meal runs.
create table public.channel_drafts (
  draft_id uuid primary key references public.meal_drafts (id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  chat_id text not null,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.channel_drafts enable row level security; -- no policies: service role only
