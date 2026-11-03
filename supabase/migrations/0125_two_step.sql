-- 0125 (1.46.0): two-step sign-in, required for everyone, enforced by the database too.
--
-- The owner (Oct 30 2026): "i want to add 2 factor authentication too if thats possible through a google authenticator
-- or email and you have to set this up in your account after first creating it".
--
--   * An authenticator app is Supabase's own (MFA, TOTP): a verified factor in auth.mfa_factors, and a session that
--     typed its code is 'aal2' in its token.
--   * Email codes are ClipTroop's: two_step_email (who chose them), two_step_codes (the one code a person has at a
--     time, its hash, 10 minutes, 5 tries) and two_step_sessions (the sign-ins that typed a right code). Only the
--     server's key writes them (app/two-step/actions.ts); nobody signed in reads or writes them.
--   * mfa_ok(): this request may use the data: the session is aal2, or it typed an email code, or the person has
--     no second step yet (the app sends them to set one up first, /two-step/setup).
--   * A restrictive policy, "two-step sign-in", on every table people reach (row level security with a policy) and on
--     storage.objects: on top
--     of each table's own policies, a signed-in request must pass mfa_ok(). So a stolen password alone reads nothing,
--     even through the API. supabase/tests/two-step.test.sql checks that every such table has it: a new table needs it
--     too (run this file's loop again, or add the policy).
--
-- Additive; safe to run twice.

create table if not exists public.two_step_email (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_at timestamptz not null default now()
);
alter table public.two_step_email enable row level security;

create table if not exists public.two_step_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('sign_in', 'setup')),
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  sent_at timestamptz not null default now()
);
alter table public.two_step_codes enable row level security;

create table if not exists public.two_step_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index if not exists two_step_sessions_user_id_idx on public.two_step_sessions (user_id);
alter table public.two_step_sessions enable row level security;

-- No policies on the three: only the service role (which skips row level security) touches them.
revoke all on public.two_step_email, public.two_step_codes, public.two_step_sessions from anon, authenticated;

create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then true
    when exists (
      select 1 from public.two_step_sessions s
       where s.user_id = auth.uid() and s.session_id::text = coalesce(auth.jwt() ->> 'session_id', '')
    ) then true
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status::text = 'verified') then false
    when exists (select 1 from public.two_step_email e where e.user_id = auth.uid()) then false
    else true
  end;
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

-- Every table with row level security, and the files.
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
       -- Tables with no policy of their own are the server's only: nothing to narrow.
       and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname <> 'two-step sign-in')
  loop
    execute format('drop policy if exists "two-step sign-in" on public.%I', t.relname);
    execute format(
      'create policy "two-step sign-in" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t.relname
    );
  end loop;
end;
$$;

drop policy if exists "two-step sign-in" on storage.objects;
create policy "two-step sign-in"
  on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok()))
  with check ((select public.mfa_ok()));

-- The API itself (PostgREST): before every request, a signed-in one that still owes its second step is turned away
-- here, so the database's functions are covered as well as its tables. It runs as the request's own role (so anon may
-- call it; it does nothing for anon), in its own schema: nothing else lives there.
create schema if not exists two_step_guard;
revoke all on schema two_step_guard from public;
grant usage on schema two_step_guard to anon, authenticated, service_role;

create or replace function two_step_guard.check_request()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and not public.mfa_ok() then
    raise sqlstate 'PT403' using message = 'Two-step sign-in needed: type your code first.', hint = 'two_step';
  end if;
end;
$$;
revoke all on function two_step_guard.check_request() from public;
grant execute on function two_step_guard.check_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''two_step_guard.check_request''';
  end if;
end;
$$;
notify pgrst, 'reload config';
