-- ============================================================================
-- 0105: sign-in limits (1.31.6)
--
--   * Wrong passwords are counted, and after too many the app waits before
--     it checks another one: 8 wrong in 15 minutes for one account from one
--     address, 30 for one account from anywhere, 40 from one address for
--     any accounts. A right password clears its account's count.
--   * Why the app's own: it signs people in from its server, so Supabase
--     sees the server's address, never the person's, and its own limits per
--     address can't tell one person from another.
--   * Neither the email nor the address is kept: only a hash of each
--     (sha256, made by the app). Rows go after a day.
--   * Only the server (service role) can read it or call the functions.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

create table if not exists public.sign_in_failures (
  id bigint generated always as identity primary key,
  account text not null,
  address text not null,
  at timestamptz not null default now()
);
create index if not exists sign_in_failures_account_at on public.sign_in_failures (account, at);
create index if not exists sign_in_failures_address_at on public.sign_in_failures (address, at);
create index if not exists sign_in_failures_at on public.sign_in_failures (at);

alter table public.sign_in_failures enable row level security;
revoke all on table public.sign_in_failures from public, anon, authenticated;
grant all on table public.sign_in_failures to service_role;

-- Seconds until the next try counts (0: now). The 8th, 30th or 40th most
-- recent wrong try in the last 15 minutes has to be 15 minutes old first.
create or replace function public.sign_in_wait(p_account text, p_address text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  win constant interval := interval '15 minutes';
  until_at timestamptz := now();
  t timestamptz;
begin
  select f.at into t from sign_in_failures f
   where f.account = p_account and f.address = p_address and f.at > now() - win
   order by f.at desc offset 7 limit 1;
  if t is not null then until_at := greatest(until_at, t + win); end if;

  select f.at into t from sign_in_failures f
   where f.account = p_account and f.at > now() - win
   order by f.at desc offset 29 limit 1;
  if t is not null then until_at := greatest(until_at, t + win); end if;

  select f.at into t from sign_in_failures f
   where f.address = p_address and f.at > now() - win
   order by f.at desc offset 39 limit 1;
  if t is not null then until_at := greatest(until_at, t + win); end if;

  return greatest(0, ceil(extract(epoch from (until_at - now()))))::int;
end;
$$;
revoke all on function public.sign_in_wait(text, text) from public, anon, authenticated;
grant execute on function public.sign_in_wait(text, text) to service_role;

-- A try: a wrong one is counted, a right one clears its account's count.
-- Rows older than a day go (the limits look back 15 minutes).
create or replace function public.sign_in_note(p_account text, p_address text, p_ok boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_ok then
    delete from sign_in_failures where account = p_account;
  else
    insert into sign_in_failures (account, address) values (p_account, p_address);
  end if;
  delete from sign_in_failures where at < now() - interval '1 day';
end;
$$;
revoke all on function public.sign_in_note(text, text, boolean) from public, anon, authenticated;
grant execute on function public.sign_in_note(text, text, boolean) to service_role;
