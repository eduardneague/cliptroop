-- Checks for 0135: Affiliates. Everyone active on a team reads its affiliates; Masters and the people a Master lets in
-- (affiliate_access) add, change and delete them; another team never sees them. A linked video must be the team's own;
-- an affiliate never moves team; who and when are the database's. Logins are sealed by the app and out of reach of
-- every signed-in request but through affiliate_login_open() / affiliate_login_save(), for the people let in only;
-- each look, change, clear and grant is written down, Masters read it, nobody writes it directly; looking is limited.
-- Leaving the team takes access away; deleting a linked video, an affiliate or a whole team still works.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). G: editor M lets in. E: editor. I: invited, not joined. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000135a1', 'm135@example.com'),
  ('00000000-0000-4000-8000-0000000135a2', 'g135@example.com'),
  ('00000000-0000-4000-8000-0000000135a3', 'e135@example.com'),
  ('00000000-0000-4000-8000-0000000135a4', 'i135@example.com'),
  ('00000000-0000-4000-8000-0000000135b1', 'x135@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%135@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000135a0', 'Team 135', 'team-135', '00000000-0000-4000-8000-0000000135a1'),
  ('10000000-0000-4000-8000-0000000135b0', 'Other 135', 'other-135', '00000000-0000-4000-8000-0000000135b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000135a2', '10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a2', 'g135@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000135a3', '10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a3', 'e135@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000135a4', '10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a4', 'i135@example.com', 'invited')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000135a2', 'editor'),
  ('30000000-0000-4000-8000-0000000135a3', 'editor'),
  ('30000000-0000-4000-8000-0000000135a4', 'editor')
on conflict do nothing;
-- A long video and a Short on each team.
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('40000000-0000-4000-8000-0000000135a1', '10000000-0000-4000-8000-0000000135a0', 'Keyboard review', 'publish', '00000000-0000-4000-8000-0000000135a1'),
  ('40000000-0000-4000-8000-0000000135b1', '10000000-0000-4000-8000-0000000135b0', 'Their video', 'ideate', '00000000-0000-4000-8000-0000000135b1')
on conflict do nothing;
insert into short_videos (id, team_id, title, created_by) values
  ('50000000-0000-4000-8000-0000000135a1', '10000000-0000-4000-8000-0000000135a0', 'Keyboard in 30 seconds', '00000000-0000-4000-8000-0000000135a1'),
  ('50000000-0000-4000-8000-0000000135b1', '10000000-0000-4000-8000-0000000135b0', 'Their short', '00000000-0000-4000-8000-0000000135b1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- What the app seals (the shape only: the database never sees a key).
create or replace function pg_temp.sealed(n int) returns text language sql as $$
  select 'av1.' || repeat('A', 16) || '.' || repeat('B', 22) || '.' || repeat('C', 20 + n);
$$;

-- 0. The functions and the tables, as each kind of caller has them.
do $$ begin
  if has_function_privilege('anon', 'affiliate_team_ids()', 'execute') then raise exception 'FAIL 0: anon may ask affiliate_team_ids()'; end if;
  if has_function_privilege('anon', 'affiliate_login_open(uuid, text)', 'execute') then raise exception 'FAIL 0: anon may open a login'; end if;
  if has_function_privilege('anon', 'affiliate_login_save(uuid, text)', 'execute') then raise exception 'FAIL 0: anon may save a login'; end if;
  if has_function_privilege('anon', 'affiliate_login_states(uuid)', 'execute') then raise exception 'FAIL 0: anon may ask which have logins'; end if;
  if has_function_privilege('authenticated', 'affiliates_ready()', 'execute') then raise exception 'FAIL 0: anyone signed in may ask affiliates_ready()'; end if;
  if not affiliates_ready() then raise exception 'FAIL 0: affiliates_ready() says no'; end if;
  if has_table_privilege('authenticated', 'affiliate_logins', 'select') or has_table_privilege('authenticated', 'affiliate_logins', 'insert')
     or has_table_privilege('authenticated', 'affiliate_logins', 'update') or has_table_privilege('authenticated', 'affiliate_logins', 'delete') then
    raise exception 'FAIL 0: signed-in requests reach the logins table';
  end if;
  if has_table_privilege('anon', 'affiliates', 'select') or has_table_privilege('anon', 'affiliate_login_events', 'select') then raise exception 'FAIL 0: anon reads affiliates'; end if;
  if has_table_privilege('authenticated', 'affiliate_login_events', 'insert') or has_table_privilege('authenticated', 'affiliate_login_events', 'update') or has_table_privilege('authenticated', 'affiliate_login_events', 'delete') then
    raise exception 'FAIL 0: signed-in requests write the activity';
  end if;
  if (select count(*) from pg_policies where tablename in ('affiliates', 'affiliate_access', 'affiliate_logins', 'affiliate_login_events') and policyname = 'two-step sign-in' and permissive = 'RESTRICTIVE') <> 4 then
    raise exception 'FAIL 0: a new table lacks the two-step rule';
  end if;
  if exists (select 1 from pg_policies where tablename = 'affiliate_logins' and policyname <> 'two-step sign-in') then raise exception 'FAIL 0: the logins table has a way in'; end if;
end $$;

-- 1. A Master adds one: trimmed, blanks are nothing, who and when are the database's; a link must be a web address.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  insert into affiliates (id, team_id, name, product_url, code, percentage, platform_url, created_by, created_at)
  values ('20000000-0000-4000-8000-0000000135a1', '10000000-0000-4000-8000-0000000135a0', '  Gravastar.com ', 'https://www.gravastar.com/products/mercury-k98', ' VIVERRO ', '10%', '', '00000000-0000-4000-8000-0000000135a3', '2020-01-01');
  do $$ declare r record; begin
    select * into r from affiliates where id = '20000000-0000-4000-8000-0000000135a1';
    if r.name <> 'Gravastar.com' or r.code <> 'VIVERRO' or r.platform_url is not null then raise exception 'FAIL 1: not tidied (%, %, %)', r.name, r.code, r.platform_url; end if;
    if r.created_by <> '00000000-0000-4000-8000-0000000135a1' or r.created_at < now() - interval '1 minute' or r.updated_by <> '00000000-0000-4000-8000-0000000135a1' then raise exception 'FAIL 1: who and when came from the app'; end if;
    if r.status <> 'active' then raise exception 'FAIL 1: a new one isn''t active'; end if;
  end $$;
  do $$ begin
    begin
      insert into affiliates (team_id, name, product_url) values ('10000000-0000-4000-8000-0000000135a0', 'Bad link', 'javascript:alert(1)');
      raise exception 'FAIL 1: a link that isn''t a web address was kept';
    exception when check_violation then null;
    end;
    begin
      insert into affiliates (team_id, name, status) values ('10000000-0000-4000-8000-0000000135a0', 'Bad status', 'gone');
      raise exception 'FAIL 1: an unknown status was kept';
    exception when check_violation then null;
    end;
  end $$;
commit;

-- 2. Someone else on the team reads it and nothing more; another team never sees it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a3');
  set local role authenticated;
  do $$ declare n int; begin
    if (select count(*) from affiliates) <> 1 then raise exception 'FAIL 2: the editor doesn''t read the team''s affiliates'; end if;
    begin
      insert into affiliates (team_id, name) values ('10000000-0000-4000-8000-0000000135a0', 'Mine');
      raise exception 'FAIL 2: the editor added one';
    exception when insufficient_privilege then null;
    end;
    update affiliates set code = 'HACKED' where id = '20000000-0000-4000-8000-0000000135a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: the editor changed one'; end if;
    delete from affiliates where id = '20000000-0000-4000-8000-0000000135a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: the editor deleted one'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from affiliates) then raise exception 'FAIL 2: another team reads them'; end if;
    begin
      insert into affiliates (team_id, name) values ('10000000-0000-4000-8000-0000000135a0', 'In theirs');
      raise exception 'FAIL 2: another team''s master added one here';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 3. Only a Master lets people in, only someone active, and it's written down.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a3');
  set local role authenticated;
  do $$ begin
    begin
      insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a3');
      raise exception 'FAIL 3: an editor let themselves in';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  do $$ begin
    begin
      insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a4');
      raise exception 'FAIL 3: someone only invited was let in';
    exception when insufficient_privilege then null;
    end;
  end $$;
  insert into affiliate_access (team_id, user_id, granted_by) values ('10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a2', '00000000-0000-4000-8000-0000000135a3');
commit;
do $$ begin
  if (select granted_by from affiliate_access where user_id = '00000000-0000-4000-8000-0000000135a2') <> '00000000-0000-4000-8000-0000000135a1' then raise exception 'FAIL 3: who gave it came from the app'; end if;
  if not exists (select 1 from affiliate_login_events where action = 'granted' and user_id = '00000000-0000-4000-8000-0000000135a1' and subject_id = '00000000-0000-4000-8000-0000000135a2') then
    raise exception 'FAIL 3: letting G in isn''t written down';
  end if;
end $$;

-- 4. Let in, G manages them: adds, changes, links the team's own videos (never another team's), never moves one.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a2');
  set local role authenticated;
  insert into affiliates (id, team_id, name, code, project_id, short_id)
  values ('20000000-0000-4000-8000-0000000135a2', '10000000-0000-4000-8000-0000000135a0', 'Abxylute.com', 'viverroVIP', '40000000-0000-4000-8000-0000000135a1', '50000000-0000-4000-8000-0000000135a1');
  update affiliates set percentage = '$5 USD OFF', status = 'paused' where id = '20000000-0000-4000-8000-0000000135a2';
  do $$ begin
    if (select percentage from affiliates where id = '20000000-0000-4000-8000-0000000135a2') <> '$5 USD OFF' then raise exception 'FAIL 4: G''s change didn''t stick'; end if;
    begin
      update affiliates set project_id = '40000000-0000-4000-8000-0000000135b1' where id = '20000000-0000-4000-8000-0000000135a2';
      raise exception 'FAIL 4: another team''s long video was linked';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliates set short_id = '50000000-0000-4000-8000-0000000135b1' where id = '20000000-0000-4000-8000-0000000135a2';
      raise exception 'FAIL 4: another team''s short was linked';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliates set team_id = '10000000-0000-4000-8000-0000000135b0' where id = '20000000-0000-4000-8000-0000000135a2';
      raise exception 'FAIL 4: an affiliate moved to another team';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 5. Logins: kept only sealed; set, opened and cleared through the functions by the people let in, each time written
--    down; nobody signed in touches the table itself; who has one is known to them alone.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a1', pg_temp.sealed(1));
  do $$ begin
    begin
      perform affiliate_login_save('20000000-0000-4000-8000-0000000135a2', 'viverro@example.com / hunter2');
      raise exception 'FAIL 5: a login as typed was kept';
    exception when check_violation then null;
    end;
    begin
      perform 1 from affiliate_logins;
      raise exception 'FAIL 5: a Master read the logins table directly';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a3');
  set local role authenticated;
  do $$ begin
    begin
      perform affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'viewed');
      raise exception 'FAIL 5: the editor opened a login';
    exception when insufficient_privilege then null;
    end;
    begin
      perform affiliate_login_save('20000000-0000-4000-8000-0000000135a1', null);
      raise exception 'FAIL 5: the editor cleared a login';
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from affiliate_login_states('10000000-0000-4000-8000-0000000135a0')) then raise exception 'FAIL 5: the editor learns which have logins'; end if;
    if exists (select 1 from affiliate_login_events) then raise exception 'FAIL 5: the editor reads the activity'; end if;
    begin
      insert into affiliate_login_events (team_id, user_id, action) values ('10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a1', 'viewed');
      raise exception 'FAIL 5: the editor wrote the activity';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a2');
  set local role authenticated;
  do $$ declare s text; begin
    s := affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'copied_password');
    if s is distinct from pg_temp.sealed(1) then raise exception 'FAIL 5: G didn''t get the sealed login'; end if;
    if affiliate_login_open('20000000-0000-4000-8000-0000000135a2', 'viewed') is not null then raise exception 'FAIL 5: one without a login gave something'; end if;
    if (select count(*) from affiliate_login_states('10000000-0000-4000-8000-0000000135a0')) <> 1 then raise exception 'FAIL 5: G doesn''t see which has a login'; end if;
    if exists (select 1 from affiliate_login_events) then raise exception 'FAIL 5: G (not a Master) reads the activity'; end if;
    begin
      perform affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'emailed');
      raise exception 'FAIL 5: an unknown way of opening was taken';
    exception when invalid_parameter_value then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135b1');
  set local role authenticated;
  do $$ begin
    begin
      perform affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'viewed');
      raise exception 'FAIL 5: another team''s master opened a login';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
do $$ begin
  if not exists (select 1 from affiliate_login_events where action = 'changed' and user_id = '00000000-0000-4000-8000-0000000135a1' and affiliate_name = 'Gravastar.com') then raise exception 'FAIL 5: setting the login isn''t written down'; end if;
  if not exists (select 1 from affiliate_login_events where action = 'copied_password' and user_id = '00000000-0000-4000-8000-0000000135a2') then raise exception 'FAIL 5: copying the password isn''t written down'; end if;
  if exists (select 1 from affiliate_login_events where action = 'viewed' and affiliate_id = '20000000-0000-4000-8000-0000000135a2') then raise exception 'FAIL 5: opening one without a login was written down'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from affiliate_login_events where team_id = '10000000-0000-4000-8000-0000000135a0') < 3 then raise exception 'FAIL 5: the Master doesn''t read the activity'; end if;
  end $$;
rollback;

-- 6. Looking is limited: 60 in 10 minutes a person.
insert into affiliate_login_events (team_id, affiliate_id, affiliate_name, user_id, action)
select '10000000-0000-4000-8000-0000000135a0', '20000000-0000-4000-8000-0000000135a1', 'Gravastar.com', '00000000-0000-4000-8000-0000000135a2', 'viewed'
  from generate_series(1, 60);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a2');
  set local role authenticated;
  do $$ begin
    begin
      perform affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'viewed');
      raise exception 'FAIL 6: the 61st look in 10 minutes went through';
    exception when program_limit_exceeded then null;
    end;
  end $$;
rollback;
update affiliate_login_events set at = now() - interval '11 minutes' where user_id = '00000000-0000-4000-8000-0000000135a2' and action = 'viewed';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a2');
  set local role authenticated;
  do $$ begin
    if affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'viewed') is null then raise exception 'FAIL 6: after 10 minutes it doesn''t open again'; end if;
  end $$;
rollback;

-- 7. A linked video deleted: the link goes, nobody "edited" the affiliate.
do $$ declare before_at timestamptz; before_by uuid; begin
  select updated_at, updated_by into before_at, before_by from affiliates where id = '20000000-0000-4000-8000-0000000135a2';
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000135a3', true);
  delete from long_video_projects where id = '40000000-0000-4000-8000-0000000135a1';
  if (select project_id from affiliates where id = '20000000-0000-4000-8000-0000000135a2') is not null then raise exception 'FAIL 7: the deleted video is still linked'; end if;
  if (select short_id from affiliates where id = '20000000-0000-4000-8000-0000000135a2') is null then raise exception 'FAIL 7: the Short went with it'; end if;
  if (select updated_by from affiliates where id = '20000000-0000-4000-8000-0000000135a2') is distinct from before_by
     or (select updated_at from affiliates where id = '20000000-0000-4000-8000-0000000135a2') is distinct from before_at then
    raise exception 'FAIL 7: deleting the video counted as editing the affiliate';
  end if;
end $$;

-- 8. G leaves the team: their access goes (written down), and with it adding, opening and changing.
delete from team_members where id = '30000000-0000-4000-8000-0000000135a2';
do $$ begin
  if exists (select 1 from affiliate_access where user_id = '00000000-0000-4000-8000-0000000135a2') then raise exception 'FAIL 8: leaving kept the access'; end if;
  if not exists (select 1 from affiliate_login_events where action = 'revoked' and subject_id = '00000000-0000-4000-8000-0000000135a2') then raise exception 'FAIL 8: losing it isn''t written down'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a2');
  set local role authenticated;
  do $$ begin
    begin
      perform affiliate_login_open('20000000-0000-4000-8000-0000000135a1', 'viewed');
      raise exception 'FAIL 8: someone who left opened a login';
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from affiliates) then raise exception 'FAIL 8: someone who left reads the affiliates'; end if;
  end $$;
rollback;

-- 9. Clearing a login, and deleting an affiliate that had one: written down, its name kept, the login gone.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a2', pg_temp.sealed(2));
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a2', null);
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a2', null);
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a1', pg_temp.sealed(3));
  delete from affiliates where id = '20000000-0000-4000-8000-0000000135a1';
commit;
do $$ begin
  if (select count(*) from affiliate_login_events where action = 'cleared' and affiliate_name = 'Abxylute.com') <> 1 then raise exception 'FAIL 9: clearing is written down once (not when there was nothing to clear)'; end if;
  if not exists (select 1 from affiliate_login_events where action = 'deleted' and affiliate_name = 'Gravastar.com' and affiliate_id is null) then raise exception 'FAIL 9: deleting one with a login isn''t written down'; end if;
  if exists (select 1 from affiliate_logins where affiliate_id = '20000000-0000-4000-8000-0000000135a1') then raise exception 'FAIL 9: the login outlived its affiliate'; end if;
end $$;

-- 10. Deleting a whole team (and its people) still works, with everything of it gone.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000135a1');
  set local role authenticated;
  select affiliate_login_save('20000000-0000-4000-8000-0000000135a2', pg_temp.sealed(4));
  insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000135a0', '00000000-0000-4000-8000-0000000135a3');
commit;
delete from teams where id = '10000000-0000-4000-8000-0000000135a0';
do $$ begin
  if exists (select 1 from affiliates where team_id = '10000000-0000-4000-8000-0000000135a0')
     or exists (select 1 from affiliate_logins where team_id = '10000000-0000-4000-8000-0000000135a0')
     or exists (select 1 from affiliate_access where team_id = '10000000-0000-4000-8000-0000000135a0')
     or exists (select 1 from affiliate_login_events where team_id = '10000000-0000-4000-8000-0000000135a0') then
    raise exception 'FAIL 10: something of the deleted team stayed';
  end if;
end $$;
-- (And the people too: an account deleted takes everything of theirs with it, the logging included.)
delete from teams where id = '10000000-0000-4000-8000-0000000135b0';
delete from profiles where email like '%135@example.com';
delete from auth.users where email like '%135@example.com';
