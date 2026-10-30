-- Checks for 0125: two-step sign-in, enforced by the database. Run by scripts/db/test-from-scratch.sh.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- A: no second step yet. T: an authenticator app. E: email codes.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000125a1', 'a125@example.com'),
  ('00000000-0000-4000-8000-0000000125b1', 't125@example.com'),
  ('00000000-0000-4000-8000-0000000125c1', 'e125@example.com')
on conflict do nothing;
insert into profiles (id, email) select id, email from auth.users where email like '%125@example.com' on conflict do nothing;
insert into auth.mfa_factors (user_id, factor_type, status) values ('00000000-0000-4000-8000-0000000125b1', 'totp', 'verified');
insert into auth.mfa_factors (user_id, factor_type, status) values ('00000000-0000-4000-8000-0000000125a1', 'totp', 'unverified');
insert into two_step_email (user_id) values ('00000000-0000-4000-8000-0000000125c1') on conflict do nothing;
insert into two_step_sessions (session_id, user_id) values ('99999999-0000-4000-8000-0000000125c1', '00000000-0000-4000-8000-0000000125c1') on conflict do nothing;

create or replace function pg_temp.as_user(p uuid, aal text default 'aal1', sid text default '') returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('request.jwt.claim.aal', aal, true), set_config('request.jwt.claim.session_id', sid, true);
$$;
create or replace function pg_temp.sees_own_profile() returns boolean language sql as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- 1. Every table people reach (a policy of its own) has the restrictive policy, and so do the files.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname <> 'two-step sign-in')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'two-step sign-in' and not p.polpermissive);
  if missing is not null then
    raise exception '1: these tables need the "two-step sign-in" policy (run 0125''s loop again): %', missing;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'two-step sign-in' and not polpermissive) then
    raise exception '1: storage.objects needs it too';
  end if;
end;
$$;

-- 2. No second step yet (an unfinished app doesn't count): the data is there (the app asks them to set one up first).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125a1');
  set local role authenticated;
  do $$ begin if not pg_temp.sees_own_profile() then raise exception '2: someone without a second step yet still uses the app'; end if; end $$;
commit;

-- 3. An authenticator app: nothing until the code (aal2).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125b1', 'aal1');
  set local role authenticated;
  do $$ begin if pg_temp.sees_own_profile() then raise exception '3: a password alone read the data'; end if; end $$;
  do $$ begin
    begin
      update profiles set full_name = 'x' where id = auth.uid();
    exception when others then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125b1', 'aal2');
  set local role authenticated;
  do $$ begin if not pg_temp.sees_own_profile() then raise exception '3: after the code, everything is there'; end if; end $$;
commit;
do $$ begin
  if (select full_name from profiles where id = '00000000-0000-4000-8000-0000000125b1') is not distinct from 'x' then
    raise exception '3: a password alone changed something';
  end if;
end $$;

-- 4. Email codes: the sign-in that typed the code, and no other.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125c1', 'aal1', '99999999-0000-4000-8000-0000000125c1');
  set local role authenticated;
  do $$ begin if not pg_temp.sees_own_profile() then raise exception '4: the sign-in that typed the code uses the app'; end if; end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125c1', 'aal1', '88888888-0000-4000-8000-0000000125c1');
  set local role authenticated;
  do $$ begin if pg_temp.sees_own_profile() then raise exception '4: another sign-in without its code read the data'; end if; end $$;
commit;

-- 5. Nobody signed in reads or writes the two-step tables (only the server's key).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125c1', 'aal2');
  set local role authenticated;
  do $$ begin
    begin
      perform 1 from two_step_codes;
      raise exception 'FAIL 5: two_step_codes is readable';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into two_step_sessions (session_id, user_id) values (gen_random_uuid(), auth.uid());
      raise exception 'FAIL 5: a session marked itself as having typed its code';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 6. The API's own check (PostgREST's pre-request): turns away a password alone, lets the rest through.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125b1', 'aal1');
  set local role authenticated;
  do $$ begin
    begin
      perform two_step_guard.check_request();
      raise exception 'FAIL 6: the API let a password alone through';
    exception when sqlstate 'PT403' then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000125a1');
  set local role authenticated;
  select two_step_guard.check_request();
commit;
begin;
  set local role anon;
  select two_step_guard.check_request();
commit;

delete from two_step_sessions where user_id in ('00000000-0000-4000-8000-0000000125c1');
delete from two_step_email where user_id = '00000000-0000-4000-8000-0000000125c1';
delete from auth.mfa_factors where user_id in ('00000000-0000-4000-8000-0000000125a1', '00000000-0000-4000-8000-0000000125b1');
delete from profiles where id in ('00000000-0000-4000-8000-0000000125a1', '00000000-0000-4000-8000-0000000125b1', '00000000-0000-4000-8000-0000000125c1');
delete from auth.users where id in ('00000000-0000-4000-8000-0000000125a1', '00000000-0000-4000-8000-0000000125b1', '00000000-0000-4000-8000-0000000125c1');
