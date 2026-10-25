-- Checks for 0107 (the database's own locks, 1.31.14), and guards for every
-- migration after it: someone who isn't signed in can't touch anything; a
-- signed-in person reaches rows only through the rules; every table has
-- rules; the database's own-rights functions set their search path; no rule
-- lets everyone read everything; who sees whose profile (and email); the
-- people searches; past members; new accounts; long-video defaults; files.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Guards (they hold for every table and function, now and later)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- 1. Someone who isn't signed in: no table, sequence or function of the app's.
  for r in
    select c.oid, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  loop
    if r.relkind = 'S' then
      if has_sequence_privilege('anon', r.oid, 'usage') or has_sequence_privilege('anon', r.oid, 'select') or has_sequence_privilege('anon', r.oid, 'update') then
        raise exception 'FAIL 1: anon can use the sequence %', r.relname;
      end if;
    elsif has_table_privilege('anon', r.oid, 'select') or has_table_privilege('anon', r.oid, 'insert') or has_table_privilege('anon', r.oid, 'update')
       or has_table_privilege('anon', r.oid, 'delete') or has_table_privilege('anon', r.oid, 'truncate') or has_table_privilege('anon', r.oid, 'references')
       or has_table_privilege('anon', r.oid, 'trigger') then
      raise exception 'FAIL 1: someone who isn''t signed in can use %: revoke all on it from anon (0107)', r.relname;
    end if;
  end loop;
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise exception 'FAIL 1: someone who isn''t signed in can call %: revoke all on function … from public, anon (0107)', r.f;
  end loop;

  -- 2. Signed in: never empty a table (TRUNCATE skips the rules), hang a trigger or a reference on one.
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'trigger')
            or has_table_privilege('authenticated', c.oid, 'references'))
  loop
    raise exception 'FAIL 2: a signed-in person can TRUNCATE, or add a trigger or reference to, %', r.relname;
  end loop;

  -- 3. Every table has row rules; a table no rule opens is the server's alone (no rights for anyone signed in).
  for r in
    select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    if not r.relrowsecurity then
      raise exception 'FAIL 3: % has no row rules (alter table … enable row level security)', r.relname;
    end if;
    if not exists (select 1 from pg_policy p where p.polrelid = r.oid)
       and (has_table_privilege('authenticated', r.oid, 'select') or has_table_privilege('authenticated', r.oid, 'insert')
            or has_table_privilege('authenticated', r.oid, 'update') or has_table_privilege('authenticated', r.oid, 'delete')) then
      raise exception 'FAIL 3: % has no rules (the server''s only) but signed-in people still have rights on it: revoke all on it from authenticated', r.relname;
    end if;
  end loop;

  -- 4. No views: a view reads with its owner's rights and skips the row rules (unless security_invoker).
  for r in
    select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    if r.relkind = 'm' or not coalesce('security_invoker=true' = any (r.reloptions) or 'security_invoker=on' = any (r.reloptions), false) then
      raise exception 'FAIL 4: % reads past the row rules (make it security_invoker, or a function that checks)', r.relname;
    end if;
  end loop;

  -- 5. Every function with the database's own rights sets its search path.
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    raise exception 'FAIL 5: % runs with the database''s rights without set search_path', r.f;
  end loop;

  -- 6. No rule lets everyone read (or write) every row.
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')
  loop
    raise exception 'FAIL 6: "%" on % lets everyone in (true)', r.policyname, r.tablename;
  end loop;

  -- 7. A new table or sequence starts out closed to anon (Supabase's defaults gave them away). New
  -- functions: Postgres gives every new one to everyone; 1 above fails for one whose migration didn't take it back.
  if exists (
    select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
     cross join lateral aclexplode(d.defaclacl) a
     where n.nspname = 'public' and d.defaclrole = (select oid from pg_roles where rolname = current_user)
       and a.grantee = (select oid from pg_roles where rolname = 'anon')
  ) then
    raise exception 'FAIL 7: new tables, sequences or functions would go to anon';
  end if;
end $$;

-- 7b. And for real: a new table, made the way a migration makes one.
begin;
  create table public.locks_probe_t (id int primary key);
  do $$
  begin
    if has_table_privilege('anon', 'public.locks_probe_t', 'select') then raise exception 'FAIL 7b: a new table is anon''s'; end if;
    if has_table_privilege('authenticated', 'public.locks_probe_t', 'truncate') then raise exception 'FAIL 7b: a new table can be emptied by signed-in people'; end if;
    if not has_table_privilege('authenticated', 'public.locks_probe_t', 'select') then raise exception 'FAIL 7b: a new table should still be readable through its rules'; end if;
  end $$;
rollback;

-- 8. The helpers only the database uses: not callable by signed-in people.
do $$
begin
  if has_function_privilege('authenticated', 'public.team_today(uuid)', 'execute') or has_function_privilege('authenticated', 'public.script_step_member_ids(uuid)', 'execute') then
    raise exception 'FAIL 8: team_today / script_step_member_ids should be the database''s own';
  end if;
  if not has_function_privilege('authenticated', 'public.global_search(text, integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.is_team_member(uuid)', 'execute') then
    raise exception 'FAIL 8: signed-in people lost a function they need';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- People: A owns T1 (B and E are on it); D owns T2 and invited C; F has only
-- an email. Nobody else knows C, D or F.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000107a01', 'ana.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a02', 'ben.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a03', 'cara.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a04', 'dan.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a05', 'eve.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a06', 'frank.q@mail107.example')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000107a01', 'ana.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a02', 'ben.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a03', 'cara.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a04', 'dan.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a05', 'eve.q@mail107.example'),
  ('00000000-0000-4000-8000-000000107a06', 'frank.q@mail107.example')
on conflict do nothing;
update profiles set username = 'zz107ana', full_name = 'Ana Owner' where id = '00000000-0000-4000-8000-000000107a01';
update profiles set username = 'zz107ben', full_name = 'Ben Member' where id = '00000000-0000-4000-8000-000000107a02';
update profiles set username = null, full_name = 'Cara Zebrafinch' where id = '00000000-0000-4000-8000-000000107a03';
update profiles set username = 'zz107dan', full_name = 'Dan Elsewhere' where id = '00000000-0000-4000-8000-000000107a04';
update profiles set username = 'zz107eve', full_name = 'Eve Former' where id = '00000000-0000-4000-8000-000000107a05';
update profiles set username = null, full_name = null where id = '00000000-0000-4000-8000-000000107a06';

insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000107a01', 'Locks One', 'locks-one', '00000000-0000-4000-8000-000000107a01'),
  ('10000000-0000-4000-8000-000000107a02', 'Locks Two', 'locks-two', '00000000-0000-4000-8000-000000107a04')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-000000107a02', '10000000-0000-4000-8000-000000107a01', '00000000-0000-4000-8000-000000107a02', 'ben.q@mail107.example', 'active'),
  ('30000000-0000-4000-8000-000000107a05', '10000000-0000-4000-8000-000000107a01', '00000000-0000-4000-8000-000000107a05', 'eve.q@mail107.example', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-000000107a02', 'editor'),
  ('30000000-0000-4000-8000-000000107a05', 'editor')
on conflict do nothing;
insert into team_invites (team_id, invited_user_id, invited_by) values
  ('10000000-0000-4000-8000-000000107a02', '00000000-0000-4000-8000-000000107a03', '00000000-0000-4000-8000-000000107a04');

-- E leaves T1: kept as someone who was on it.
delete from team_members where id = '30000000-0000-4000-8000-000000107a05';

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
-- The ids in a list of people, only this file's (other files' people may match a search too).
create or replace function pg_temp.ids(j jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((x->>'id')::uuid order by x->>'id'), '{}') from jsonb_array_elements(j) x
   where x->>'id' like '00000000-0000-4000-8000-000000107a0%'
$$;

-- 9. Past members: E is remembered for T1.
do $$
begin
  if not exists (select 1 from team_past_members where team_id = '10000000-0000-4000-8000-000000107a01' and user_id = '00000000-0000-4000-8000-000000107a05') then
    raise exception 'FAIL 9: E left T1 and should be remembered';
  end if;
end $$;

-- 10. Who sees whose profile.
create temp table seen (who uuid, saw uuid[]);
grant select, insert on seen to authenticated;
do $$
declare
  u uuid;
begin
  foreach u in array array['00000000-0000-4000-8000-000000107a01', '00000000-0000-4000-8000-000000107a02', '00000000-0000-4000-8000-000000107a03',
                           '00000000-0000-4000-8000-000000107a04', '00000000-0000-4000-8000-000000107a06']::uuid[] loop
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    insert into seen select u, coalesce(array_agg(id order by id), '{}') from profiles where id::text like '00000000-0000-4000-8000-000000107a0%';
    reset role;
  end loop;
end $$;
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000107a01'; b uuid := '00000000-0000-4000-8000-000000107a02'; c uuid := '00000000-0000-4000-8000-000000107a03';
  d uuid := '00000000-0000-4000-8000-000000107a04'; e uuid := '00000000-0000-4000-8000-000000107a05'; f uuid := '00000000-0000-4000-8000-000000107a06';
  got uuid[];
begin
  -- A (T1's master): A, B, and E who was on T1.
  select saw into got from seen where who = a;
  if got is distinct from array[a, b, e] then raise exception 'FAIL 10: A should see A, B, E (got %)', got; end if;
  -- B (on T1): the same.
  select saw into got from seen where who = b;
  if got is distinct from array[a, b, e] then raise exception 'FAIL 10: B should see A, B, E (got %)', got; end if;
  -- C (on no team, invited by D): C and D.
  select saw into got from seen where who = c;
  if got is distinct from array[c, d] then raise exception 'FAIL 10: C should see C and the one who invited them, D (got %)', got; end if;
  -- D (T2's master, invited C): D and C.
  select saw into got from seen where who = d;
  if got is distinct from array[c, d] then raise exception 'FAIL 10: D should see D and the one they invited, C (got %)', got; end if;
  -- F (nobody): F.
  select saw into got from seen where who = f;
  if got is distinct from array[f] then raise exception 'FAIL 10: F should see only themselves (got %)', got; end if;
end $$;

-- 10b. The invite ends: D and C stop seeing each other.
begin;
  update team_invites set status = 'declined', responded_at = now()
   where team_id = '10000000-0000-4000-8000-000000107a02' and invited_user_id = '00000000-0000-4000-8000-000000107a03';
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a04');
  set local role authenticated;
  do $$
  begin
    if exists (select 1 from profiles where id = '00000000-0000-4000-8000-000000107a03') then
      raise exception 'FAIL 10b: D still sees C after the invite was declined';
    end if;
  end $$;
rollback;

-- 11. Someone who isn't signed in: no profiles, no card, no search.
begin;
  set local role anon;
  do $$ begin
    perform 1 from profiles limit 1;
    raise exception 'FAIL 11: anon read profiles';
  exception when insufficient_privilege then null;
  end $$;
  do $$ begin
    perform profile_card('zz107ana');
    raise exception 'FAIL 11: anon called profile_card';
  exception when insufficient_privilege then null;
  end $$;
  do $$ begin
    perform global_search('zz107', 6);
    raise exception 'FAIL 11: anon called global_search';
  exception when insufficient_privilege then null;
  end $$;
rollback;

-- 12. A profile page's card: anyone's, for anyone signed in, by username (any capitals) or id. Never an email.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a06');
  set local role authenticated;
  do $$
  declare
    r record;
  begin
    select * into r from profile_card('ZZ107Ana');
    if r.id is distinct from '00000000-0000-4000-8000-000000107a01'::uuid or r.full_name <> 'Ana Owner' then raise exception 'FAIL 12: F should see A''s card by username (got %)', r; end if;
    select * into r from profile_card('00000000-0000-4000-8000-000000107a04');
    if r.username is distinct from 'zz107dan' then raise exception 'FAIL 12: F should see D''s card by id (got %)', r; end if;
    if exists (select 1 from profile_card('zz107%')) or exists (select 1 from profile_card('zz107_na')) or exists (select 1 from profile_card('')) then raise exception 'FAIL 12: a pattern or nothing found someone'; end if;
  end $$;
rollback;
do $$
begin
  if exists (select 1 from pg_proc p cross join lateral unnest(coalesce(p.proargnames, '{}')) a
              where p.proname in ('profile_card', 'people_to_invite') and a ~* 'email') then
    raise exception 'FAIL 12: a card or an invite search hands back an email';
  end if;
end $$;

-- 13. Team → Invite people: Masters only; names and usernames; an email only typed whole; not the team's own.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a01');
  set local role authenticated;
  do $$
  declare
    t1 uuid := '10000000-0000-4000-8000-000000107a01';
    got uuid[];
  begin
    got := array(select id from people_to_invite(t1, 'zebrafinch'));
    if got is distinct from array['00000000-0000-4000-8000-000000107a03'::uuid] then raise exception 'FAIL 13: A should find C by name (got %)', got; end if;
    got := array(select id from people_to_invite(t1, 'frank.q@mail107'));
    if cardinality(got) <> 0 then raise exception 'FAIL 13: part of an email found someone (got %)', got; end if;
    got := array(select id from people_to_invite(t1, 'FRANK.Q@mail107.example'));
    if got is distinct from array['00000000-0000-4000-8000-000000107a06'::uuid] then raise exception 'FAIL 13: the whole email should find F (got %)', got; end if;
    got := array(select id from people_to_invite(t1, 'zz107'));
    if '00000000-0000-4000-8000-000000107a02'::uuid = any (got) or '00000000-0000-4000-8000-000000107a01'::uuid = any (got) then
      raise exception 'FAIL 13: people already on the team came back (got %)', got;
    end if;
    if not ('00000000-0000-4000-8000-000000107a04'::uuid = any (got)) or not ('00000000-0000-4000-8000-000000107a05'::uuid = any (got)) then
      raise exception 'FAIL 13: D and E (who left) should be invitable (got %)', got;
    end if;
    if exists (select 1 from people_to_invite(t1, '%')) or exists (select 1 from people_to_invite(t1, '%%')) or exists (select 1 from people_to_invite(t1, '__'))
       or exists (select 1 from people_to_invite(t1, 'a')) then
      raise exception 'FAIL 13: a wildcard or one letter found someone';
    end if;
    if exists (select 1 from people_to_invite('10000000-0000-4000-8000-000000107a02', 'zebrafinch')) then raise exception 'FAIL 13: A searched for T2, where A isn''t a Master'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a02');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from people_to_invite('10000000-0000-4000-8000-000000107a01', 'zebrafinch')) then raise exception 'FAIL 13: B isn''t a Master but searched'; end if;
  end $$;
rollback;
-- D's live invite: C isn't offered to D again.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a04');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from people_to_invite('10000000-0000-4000-8000-000000107a02', 'zebrafinch')) then raise exception 'FAIL 13: C already has a live invite to T2'; end if;
  end $$;
rollback;

-- 14. The search bar: anyone by name; an email only whole (or the start of one you can see anyway); the part before the @ only then.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a02');
  set local role authenticated;
  do $$
  declare
    r jsonb;
    p jsonb;
  begin
    r := global_search('zebrafinch', 6);
    if pg_temp.ids(r->'people') is distinct from array['00000000-0000-4000-8000-000000107a03'::uuid] then raise exception 'FAIL 14: B should find C by name (got %)', r->'people'; end if;
    select x into p from jsonb_array_elements(r->'people') x where x->>'id' = '00000000-0000-4000-8000-000000107a03';
    if p ? 'email' or p->>'email_name' is not null or (p->>'is_teammate')::boolean then raise exception 'FAIL 14: C came back with %', p; end if;
    if pg_temp.ids(search_people('zebrafinch', 6)) is distinct from pg_temp.ids(r->'people') then raise exception 'FAIL 14: global_search''s people are search_people''s'; end if;

    r := global_search('frank.q@mail1', 6);
    if cardinality(pg_temp.ids(r->'people')) <> 0 then raise exception 'FAIL 14: the start of a stranger''s email found them (got %)', r->'people'; end if;
    r := global_search('frank.q@mail107.example', 6);
    select x into p from jsonb_array_elements(r->'people') x where x->>'id' = '00000000-0000-4000-8000-000000107a06';
    if p->>'id' is distinct from '00000000-0000-4000-8000-000000107a06' or p->>'email_name' is distinct from 'frank.q' then raise exception 'FAIL 14: the whole email should find F (got %)', r->'people'; end if;

    -- E left B's team: still found by the start of their email, still with a name.
    r := global_search('eve.q@mail1', 6);
    if pg_temp.ids(r->'people') is distinct from array['00000000-0000-4000-8000-000000107a05'::uuid] then raise exception 'FAIL 14: B should find E (who was on T1) by the start of their email (got %)', r->'people'; end if;
    -- A teammate: is_teammate.
    r := global_search('zz107ana', 6);
    if not exists (select 1 from jsonb_array_elements(r->'people') x where x->>'id' = '00000000-0000-4000-8000-000000107a01' and (x->>'is_teammate')::boolean) then
      raise exception 'FAIL 14: A should come back as B''s teammate (got %)', r->'people';
    end if;
  end $$;
rollback;

-- 15. What E made still shows E's name to the team (past members), and removing, leaving, deleting a team or an account still work.
begin;
  -- The team: deleting T2 (owner D) takes its invites and past members with it, and leaves nothing behind.
  insert into team_past_members (team_id, user_id) values ('10000000-0000-4000-8000-000000107a02', '00000000-0000-4000-8000-000000107a05');
  delete from teams where id = '10000000-0000-4000-8000-000000107a02';
  do $$ begin
    if exists (select 1 from team_past_members where team_id = '10000000-0000-4000-8000-000000107a02') then raise exception 'FAIL 15: a deleted team kept past members'; end if;
  end $$;
  -- An account: deleting E's takes E's past memberships with it.
  delete from auth.users where id = '00000000-0000-4000-8000-000000107a05';
  delete from profiles where id = '00000000-0000-4000-8000-000000107a05';
  do $$ begin
    if exists (select 1 from team_past_members where user_id = '00000000-0000-4000-8000-000000107a05') then raise exception 'FAIL 15: a deleted account kept past memberships'; end if;
  end $$;
  -- Leaving: B leaves T1 and is remembered.
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a02');
  set local role authenticated;
  select leave_team('10000000-0000-4000-8000-000000107a01');
  reset role;
  do $$ begin
    if not exists (select 1 from team_past_members where team_id = '10000000-0000-4000-8000-000000107a01' and user_id = '00000000-0000-4000-8000-000000107a02') then
      raise exception 'FAIL 15: B left T1 and should be remembered';
    end if;
  end $$;
rollback;

-- 16. A new account is a profile, nothing more: an old email invite doesn't put it on a team.
begin;
  insert into team_members (team_id, invited_email, status) values ('10000000-0000-4000-8000-000000107a01', 'gina.q@mail107.example', 'invited');
  insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000107a07', 'gina.q@mail107.example');
  do $$ begin
    if not exists (select 1 from profiles where id = '00000000-0000-4000-8000-000000107a07' and email = 'gina.q@mail107.example') then raise exception 'FAIL 16: a new account should get a profile'; end if;
    if exists (select 1 from team_members where user_id = '00000000-0000-4000-8000-000000107a07') then raise exception 'FAIL 16: a new account joined a team by its email'; end if;
  end $$;
rollback;

-- 17. Long videos' default people: active members of the same team.
begin;
  select set_config('locks.other', (select id::text from team_members where team_id = '10000000-0000-4000-8000-000000107a02' limit 1), true);
  select pg_temp.as_user('00000000-0000-4000-8000-000000107a01');
  set local role authenticated;
  do $$
  declare
    other uuid := current_setting('locks.other')::uuid;
  begin
    begin
      update teams set default_long_editor_id = other where id = '10000000-0000-4000-8000-000000107a01';
      raise exception 'FAIL 17: someone on another team became a default';
    exception when check_violation then null;
    end;
    update teams set default_long_editor_id = '30000000-0000-4000-8000-000000107a02', default_long_filmer_id = null where id = '10000000-0000-4000-8000-000000107a01';
    if (select default_long_editor_id from teams where id = '10000000-0000-4000-8000-000000107a01') is distinct from '30000000-0000-4000-8000-000000107a02'::uuid then
      raise exception 'FAIL 17: B (on the team) should be a default';
    end if;
  end $$;
rollback;

-- 18. Files: the sketch rule that never worked is gone; attachments and short videos take what the app sends.
do $$
declare
  types text[];
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'teammates upload sketches') then
    raise exception 'FAIL 18: the broken sketch upload rule is still there';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'ALL')
              and coalesce(qual, '') || coalesce(with_check, '') like '%''script-sketches''%') then
    raise exception 'FAIL 18: someone can upload a drawing without the app signing it';
  end if;
  select allowed_mime_types into types from storage.buckets where id = 'comment-attachments';
  if types is null or 'application/octet-stream' <> all (types) then raise exception 'FAIL 18: comment attachments need a list, with plain downloads on it (got %)', types; end if;
  if exists (select 1 from unnest(types) t
              where t in ('text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml', 'image/*', 'text/*', 'application/*', '*/*')
                 or t like '%javascript%' or t like '%ecmascript%') then
    raise exception 'FAIL 18: comment attachments take something a browser would run (%)', types;
  end if;
  select allowed_mime_types into types from storage.buckets where id = 'review-videos';
  if types is distinct from array['video/mp4', 'video/quicktime', 'video/webm'] then raise exception 'FAIL 18: short videos for review take %', types; end if;
end $$;

select 'database-locks checks passed' as ok;
