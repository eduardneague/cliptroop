-- Checks for 0119: who else may delete videos. Only the team's owner gives it (shorts, long videos or both), changes it
-- and takes it away, and only to someone else active on the team; the person and the owner see it; who gave it and
-- when are the database's; leaving the team (or becoming its owner) takes it away. Several at once is the owner's
-- call too (set_delete_rules; nobody writes the columns themselves). delete_shorts deletes for Masters as before and
-- for the people given shorts: one at a time, or several when the team lets them; nobody else, no other team.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- O: the owner (a master). M: another master. A: editor given shorts. B: editor given long videos. C: editor, nothing.
-- D: invited, not joined. X: owner of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000119a1', 'o119@example.com'),
  ('00000000-0000-4000-8000-0000000119a2', 'm119@example.com'),
  ('00000000-0000-4000-8000-0000000119a3', 'a119@example.com'),
  ('00000000-0000-4000-8000-0000000119a4', 'b119@example.com'),
  ('00000000-0000-4000-8000-0000000119a5', 'c119@example.com'),
  ('00000000-0000-4000-8000-0000000119a6', 'd119@example.com'),
  ('00000000-0000-4000-8000-0000000119b1', 'x119@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%119@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000119a0', 'Team 119', 'team-119', '00000000-0000-4000-8000-0000000119a1'),
  ('10000000-0000-4000-8000-0000000119b0', 'Other 119', 'other-119', '00000000-0000-4000-8000-0000000119b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000119a2', '10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a2', 'm119@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000119a3', '10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a3', 'a119@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000119a4', '10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a4', 'b119@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000119a5', '10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a5', 'c119@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000119a6', '10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a6', 'd119@example.com', 'invited')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000119a2', 'master'),
  ('30000000-0000-4000-8000-0000000119a3', 'editor'),
  ('30000000-0000-4000-8000-0000000119a4', 'editor'),
  ('30000000-0000-4000-8000-0000000119a5', 'editor'),
  ('30000000-0000-4000-8000-0000000119a6', 'editor')
on conflict do nothing;
-- Shorts S1–S8 on the team, S9 on the other team.
insert into short_videos (id, team_id, title, created_by) values
  ('50000000-0000-4000-8000-0000000119a1', '10000000-0000-4000-8000-0000000119a0', 'Short 1', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a2', '10000000-0000-4000-8000-0000000119a0', 'Short 2', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a3', '10000000-0000-4000-8000-0000000119a0', 'Short 3', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a4', '10000000-0000-4000-8000-0000000119a0', 'Short 4', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a5', '10000000-0000-4000-8000-0000000119a0', 'Short 5', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a6', '10000000-0000-4000-8000-0000000119a0', 'Short 6', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a7', '10000000-0000-4000-8000-0000000119a0', 'Short 7', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119a8', '10000000-0000-4000-8000-0000000119a0', 'Short 8', '00000000-0000-4000-8000-0000000119a1'),
  ('50000000-0000-4000-8000-0000000119b9', '10000000-0000-4000-8000-0000000119b0', 'Other short', '00000000-0000-4000-8000-0000000119b1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
create or replace function pg_temp.short_left(p uuid) returns boolean language sql as $$
  select exists (select 1 from short_videos where id = p);
$$;

-- 0. Who may call what: nobody who isn't signed in; the stamps and the leaving are the database's own.
do $$ begin
  if has_function_privilege('anon', 'my_owned_team_ids()', 'execute') or has_function_privilege('anon', 'set_delete_rules(uuid, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'delete_shorts(uuid[])', 'execute') then
    raise exception 'FAIL 0: someone who isn''t signed in may call 0119''s functions';
  end if;
  if not has_function_privilege('authenticated', 'set_delete_rules(uuid, boolean, boolean)', 'execute') or not has_function_privilege('authenticated', 'delete_shorts(uuid[])', 'execute') then
    raise exception 'FAIL 0: signed-in people should call set_delete_rules and delete_shorts (they check who''s asking)';
  end if;
  if has_function_privilege('authenticated', 'video_delete_access_stamp()', 'execute') or has_function_privilege('authenticated', 'video_delete_access_on_leave()', 'execute')
     or has_function_privilege('authenticated', 'video_delete_access_new_owner()', 'execute') then
    raise exception 'FAIL 0: signed-in people may call the triggers'' functions';
  end if;
  if has_table_privilege('anon', 'video_delete_access', 'select') then raise exception 'FAIL 0: anon reads delete access'; end if;
  if has_column_privilege('authenticated', 'video_delete_access', 'granted_by', 'update') or has_column_privilege('authenticated', 'video_delete_access', 'team_id', 'update')
     or has_column_privilege('authenticated', 'video_delete_access', 'user_id', 'update') then
    raise exception 'FAIL 0: signed-in people may change more than what may be deleted';
  end if;
  if has_column_privilege('authenticated', 'teams', 'delete_many_shorts', 'update') or has_column_privilege('authenticated', 'teams', 'delete_many_longs', 'update') then
    raise exception 'FAIL 0: signed-in people may write the several-at-once rules themselves';
  end if;
  if (select delete_many_shorts or delete_many_longs from teams where id = '10000000-0000-4000-8000-0000000119a0') then
    raise exception 'FAIL 0: a team starts with one at a time';
  end if;
end $$;

-- 1. O gives A shorts and B long videos: who gave it and when are the database's (forged ones replaced). Nobody who
-- isn't active on the team gets it (D invited, X on another team), nor O themselves; a row with nothing is refused.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a1');
  set local role authenticated;
  insert into video_delete_access (team_id, user_id, shorts, granted_by, granted_at)
  values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a3', true, '00000000-0000-4000-8000-0000000119a5', '2001-01-01');
  insert into video_delete_access (team_id, user_id, longs) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a4', true);
  do $$ begin
    begin
      insert into video_delete_access (team_id, user_id, shorts) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a6', true);
      raise exception 'FAIL 1: someone only invited was given it';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into video_delete_access (team_id, user_id, shorts) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119b1', true);
      raise exception 'FAIL 1: someone not on the team was given it';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into video_delete_access (team_id, user_id, shorts) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a1', true);
      raise exception 'FAIL 1: the owner gave it to themselves';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into video_delete_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a5');
      raise exception 'FAIL 1: a row that lets nothing be deleted was kept';
    exception when check_violation then null;
    end;
    if (select count(*) from video_delete_access where team_id = '10000000-0000-4000-8000-0000000119a0') <> 2 then raise exception 'FAIL 1: the owner doesn''t see who has it'; end if;
  end $$;
commit;
do $$ begin
  if (select granted_by from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a3') is distinct from '00000000-0000-4000-8000-0000000119a1'
     or (select granted_at from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a3') < now() - interval '1 minute' then
    raise exception 'FAIL 1: who gave A theirs, and when, should be the database''s';
  end if;
end $$;

-- 2. Another master (M) gives, changes and takes away nothing, and sees nothing; A sees only their own; C nothing.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a2');
  set local role authenticated;
  do $$
  declare n int;
  begin
    begin
      insert into video_delete_access (team_id, user_id, shorts) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a5', true);
      raise exception 'FAIL 2: a master who isn''t the owner gave it';
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from video_delete_access) then raise exception 'FAIL 2: a master who isn''t the owner sees who has it'; end if;
    update video_delete_access set longs = true where user_id = '00000000-0000-4000-8000-0000000119a3';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: a master who isn''t the owner changed it'; end if;
    delete from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a4';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: a master who isn''t the owner took it away'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if (select count(*) from video_delete_access) <> 1 or not exists (select 1 from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a3' and shorts and not longs) then
      raise exception 'FAIL 2: A should see their own (shorts) and nobody else''s';
    end if;
    update video_delete_access set longs = true where user_id = '00000000-0000-4000-8000-0000000119a3';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: A gave themselves long videos'; end if;
    begin
      insert into video_delete_access (team_id, user_id, longs) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a5', true);
      raise exception 'FAIL 2: A gave it to someone';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a5');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from video_delete_access) then raise exception 'FAIL 2: C sees who has it'; end if;
  end $$;
rollback;

-- 3. The several-at-once rules: the owner changes them (one, the other, or both); nobody else does, through the function
-- or the table itself; everyone on the team reads them.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a2');
  set local role authenticated;
  do $$ begin
    begin
      perform set_delete_rules('10000000-0000-4000-8000-0000000119a0', true, true);
      raise exception 'FAIL 3: a master who isn''t the owner changed the rules';
    exception when insufficient_privilege then null;
    end;
    begin
      update teams set delete_many_shorts = true where id = '10000000-0000-4000-8000-0000000119a0';
      raise exception 'FAIL 3: a master wrote the rule straight into the team';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119b1');
  set local role authenticated;
  do $$ begin
    begin
      perform set_delete_rules('10000000-0000-4000-8000-0000000119a0', true, null);
      raise exception 'FAIL 3: another team''s owner changed the rules';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a1');
  set local role authenticated;
  select set_delete_rules('10000000-0000-4000-8000-0000000119a0', null, true);
  do $$ begin
    if (select delete_many_shorts from teams where id = '10000000-0000-4000-8000-0000000119a0') or not (select delete_many_longs from teams where id = '10000000-0000-4000-8000-0000000119a0') then
      raise exception 'FAIL 3: null leaves a rule as it was; true turns it on';
    end if;
  end $$;
  select set_delete_rules('10000000-0000-4000-8000-0000000119a0', false, false);
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$ begin
    if (select delete_many_shorts or delete_many_longs from teams where id = '10000000-0000-4000-8000-0000000119a0') is distinct from false then
      raise exception 'FAIL 3: A should read the rules (both one at a time now)';
    end if;
  end $$;
rollback;

-- 4. delete_shorts: A (given shorts) one at a time; several only once the owner lets them; B (long videos only), C and
-- X delete nothing; M (a master) deletes several regardless; the same id twice counts once; more than 200 is refused.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$
  declare got uuid[];
  begin
    got := array(select short_id from delete_shorts(array['50000000-0000-4000-8000-0000000119a1', '50000000-0000-4000-8000-0000000119a2']::uuid[]));
    if cardinality(got) <> 0 or not pg_temp.short_left('50000000-0000-4000-8000-0000000119a1') then raise exception 'FAIL 4: A deleted two at once (got %)', got; end if;
    got := array(select short_id from delete_shorts(array['50000000-0000-4000-8000-0000000119a1', '50000000-0000-4000-8000-0000000119a1']::uuid[]));
    if got is distinct from array['50000000-0000-4000-8000-0000000119a1']::uuid[] or pg_temp.short_left('50000000-0000-4000-8000-0000000119a1') then
      raise exception 'FAIL 4: A should delete one (the same id twice is one; got %)', got;
    end if;
    got := array(select short_id from delete_shorts(array['50000000-0000-4000-8000-0000000119b9']::uuid[]));
    if cardinality(got) <> 0 then raise exception 'FAIL 4: A deleted another team''s short'; end if;
  end $$;
commit;
do $$ begin
  -- (Looked at as the database: A can't see the other team's shorts at all.)
  if not pg_temp.short_left('50000000-0000-4000-8000-0000000119b9') then raise exception 'FAIL 4: the other team''s short is gone'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a4');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from delete_shorts(array['50000000-0000-4000-8000-0000000119a2']::uuid[])) or not pg_temp.short_left('50000000-0000-4000-8000-0000000119a2') then
      raise exception 'FAIL 4: B (long videos only) deleted a short';
    end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a5');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from delete_shorts(array['50000000-0000-4000-8000-0000000119a2']::uuid[])) then raise exception 'FAIL 4: C deleted a short'; end if;
    -- (And the table's own rule still says no.)
    delete from short_videos where id = '50000000-0000-4000-8000-0000000119a2';
    if not pg_temp.short_left('50000000-0000-4000-8000-0000000119a2') then raise exception 'FAIL 4: C deleted a short straight from the table'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$ begin
    -- A straight from the table: still only Masters (0026). Given ones go through delete_shorts.
    delete from short_videos where id = '50000000-0000-4000-8000-0000000119a2';
    if not pg_temp.short_left('50000000-0000-4000-8000-0000000119a2') then raise exception 'FAIL 4: A deleted straight from the table'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from delete_shorts(array['50000000-0000-4000-8000-0000000119a2', '50000000-0000-4000-8000-0000000119a3']::uuid[])) then raise exception 'FAIL 4: X deleted our shorts'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a1');
  set local role authenticated;
  select set_delete_rules('10000000-0000-4000-8000-0000000119a0', true, null);
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$
  declare got uuid[];
  begin
    got := array(select short_id from delete_shorts(array['50000000-0000-4000-8000-0000000119a2', '50000000-0000-4000-8000-0000000119a3', '50000000-0000-4000-8000-0000000119b9']::uuid[]) order by 1);
    if got is distinct from array['50000000-0000-4000-8000-0000000119a2', '50000000-0000-4000-8000-0000000119a3']::uuid[] then
      raise exception 'FAIL 4: with several let go, A should delete both of ours and not the other team''s (got %)', got;
    end if;
    begin
      perform delete_shorts(array(select gen_random_uuid() from generate_series(1, 201)));
      raise exception 'FAIL 4: 201 shorts at once went through';
    exception when invalid_parameter_value then null;
    end;
    if exists (select 1 from delete_shorts('{}'::uuid[])) or exists (select 1 from delete_shorts(null)) then raise exception 'FAIL 4: nothing asked should delete nothing'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a1');
  set local role authenticated;
  select set_delete_rules('10000000-0000-4000-8000-0000000119a0', false, null);
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a2');
  set local role authenticated;
  do $$
  declare got uuid[];
  begin
    got := array(select short_id from delete_shorts(array['50000000-0000-4000-8000-0000000119a4', '50000000-0000-4000-8000-0000000119a5']::uuid[]) order by 1);
    if got is distinct from array['50000000-0000-4000-8000-0000000119a4', '50000000-0000-4000-8000-0000000119a5']::uuid[] then
      raise exception 'FAIL 4: a master deletes several whatever the rule (got %)', got;
    end if;
  end $$;
rollback;
do $$ begin
  begin
    perform delete_shorts(array['50000000-0000-4000-8000-0000000119a4']::uuid[]);
    raise exception 'FAIL 4: deleting without signing in went through';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5. Given it, then only invited again (a test of the rule, not something the app does): it no longer counts.
update team_members set status = 'invited' where id = '30000000-0000-4000-8000-0000000119a3';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a3');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from delete_shorts(array['50000000-0000-4000-8000-0000000119a6']::uuid[])) then raise exception 'FAIL 5: someone no longer active deleted a short'; end if;
  end $$;
rollback;
update team_members set status = 'active' where id = '30000000-0000-4000-8000-0000000119a3';

-- 6. The owner changes A's (long videos too) and takes B's away.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000119a1');
  set local role authenticated;
  update video_delete_access set longs = true where user_id = '00000000-0000-4000-8000-0000000119a3';
  delete from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a4';
commit;
do $$ begin
  if not exists (select 1 from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a3' and shorts and longs) then raise exception 'FAIL 6: A should have both now'; end if;
  if exists (select 1 from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a4') then raise exception 'FAIL 6: B''s should be gone'; end if;
end $$;

-- 7. Leaving takes it away (coming back doesn't bring it back); so does becoming the owner.
insert into video_delete_access (team_id, user_id, longs) values ('10000000-0000-4000-8000-0000000119a0', '00000000-0000-4000-8000-0000000119a5', true);
delete from team_members where id = '30000000-0000-4000-8000-0000000119a3';
do $$ begin
  if exists (select 1 from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a3') then raise exception 'FAIL 7: A left and kept it'; end if;
end $$;
update teams set owner_id = '00000000-0000-4000-8000-0000000119a5' where id = '10000000-0000-4000-8000-0000000119a0';
do $$ begin
  if exists (select 1 from video_delete_access where user_id = '00000000-0000-4000-8000-0000000119a5') then raise exception 'FAIL 7: the new owner kept theirs'; end if;
end $$;

-- Tidy up.
update teams set owner_id = '00000000-0000-4000-8000-0000000119a1' where id = '10000000-0000-4000-8000-0000000119a0';
delete from short_videos where team_id in ('10000000-0000-4000-8000-0000000119a0', '10000000-0000-4000-8000-0000000119b0');
delete from teams where id in ('10000000-0000-4000-8000-0000000119a0', '10000000-0000-4000-8000-0000000119b0');
delete from profiles where email like '%119@example.com';
delete from auth.users where email like '%119@example.com';
