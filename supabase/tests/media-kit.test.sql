-- Checks for 0114, 0116, 0117 and 0118: the media kit's setup, its cover photo and its templates. Masters and the
-- people a Master lets in (media_kit_access, 0117) read, start and change the setup and the templates; nobody else on
-- the team does, revenue access alone included; another team never does; when and by whom is the database's; the
-- setup is one JSON object of 100 KB at most. The cover photos: a private bucket of pictures (no SVG), 5 MB; the same
-- people read, add, replace and remove them, in their own team's folder only. 0117 turns 1.39.0's Partnerships role
-- into media kit access. Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). S: had Partnerships (1.39.0), let in by 0117. I: had Partnerships, still only invited. R: editor
-- given revenue access. E: editor. P: scheduler. G: editor M lets in. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000114a1', 'm114@example.com'),
  ('00000000-0000-4000-8000-0000000114a2', 'r114@example.com'),
  ('00000000-0000-4000-8000-0000000114a3', 'e114@example.com'),
  ('00000000-0000-4000-8000-0000000114a4', 'p114@example.com'),
  ('00000000-0000-4000-8000-0000000114a5', 's114@example.com'),
  ('00000000-0000-4000-8000-0000000114a6', 'i114@example.com'),
  ('00000000-0000-4000-8000-0000000114a7', 'g114@example.com'),
  ('00000000-0000-4000-8000-0000000114b1', 'x114@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%114@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000114a0', 'Team 114', 'team-114', '00000000-0000-4000-8000-0000000114a1'),
  ('10000000-0000-4000-8000-0000000114b0', 'Other 114', 'other-114', '00000000-0000-4000-8000-0000000114b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000114a2', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a2', 'r114@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000114a3', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a3', 'e114@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000114a4', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a4', 'p114@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000114a5', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a5', 's114@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000114a6', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a6', 'i114@example.com', 'invited'),
  ('30000000-0000-4000-8000-0000000114a7', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a7', 'g114@example.com', 'active')
on conflict do nothing;
-- As 1.39.0 left them: S and I with Partnerships, a pending invite offering it, and a colour for it.
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000114a2', 'editor'),
  ('30000000-0000-4000-8000-0000000114a3', 'editor'),
  ('30000000-0000-4000-8000-0000000114a4', 'publisher'),
  ('30000000-0000-4000-8000-0000000114a5', 'partnerships'),
  ('30000000-0000-4000-8000-0000000114a5', 'editor'),
  ('30000000-0000-4000-8000-0000000114a6', 'partnerships'),
  ('30000000-0000-4000-8000-0000000114a7', 'editor')
on conflict do nothing;
insert into revenue_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a2') on conflict do nothing;
insert into team_invites (team_id, invited_user_id, invited_by, proposed_roles) values
  ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114b1', '00000000-0000-4000-8000-0000000114a1', array['editor', 'partnerships']::role_type[]);
insert into role_colors (team_id, role, color) values
  ('10000000-0000-4000-8000-0000000114a0', 'partnerships', '#ff0000'),
  ('10000000-0000-4000-8000-0000000114a0', 'editor', '#00ff00')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 0. The helpers, and 0114's rules gone (revenue people reading, Masters alone writing).
do $$ begin
  if role_allows_stage('partnerships', 'edit') or role_allows_stage('partnerships', 'publish') then
    raise exception 'FAIL 0: Partnerships has a step of its own';
  end if;
  if has_function_privilege('anon', 'media_kit_team_ids()', 'execute') then raise exception 'FAIL 0: anon may ask media_kit_team_ids()'; end if;
  if has_function_privilege('authenticated', 'media_kit_role_to_access()', 'execute') or has_function_privilege('anon', 'media_kit_role_to_access()', 'execute') then
    raise exception 'FAIL 0: anyone may run media_kit_role_to_access()';
  end if;
  if exists (select 1 from pg_policies where policyname in ('revenue people read the media kit', 'masters start the media kit', 'masters change the media kit', 'media kit: revenue people read', 'media kit: masters add', 'media kit: masters replace', 'media kit: masters remove')) then
    raise exception 'FAIL 0: an old media kit rule is still there';
  end if;
end $$;

-- 0b. Before 0117's change (as 1.39.0 left it), Partnerships alone opens nothing now: S doesn't read the kit.
insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "Team 114"}') on conflict (team_id) do nothing;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from media_kit_settings) then raise exception 'FAIL 0b: the Partnerships role alone still opens the kit'; end if;
  end $$;
rollback;

-- 0c. The Partnerships role becomes media kit access (0117 does it once; again here, for the people above): S and I
-- get it (I counts once they've joined), the role goes from members, invites and colours; a second run changes nothing.
do $$
declare n int;
begin
  n := media_kit_role_to_access();
  if n <> 2 then raise exception 'FAIL 0c: % people got media kit access (2 had Partnerships)', n; end if;
  if exists (select 1 from member_roles where role = 'partnerships') then raise exception 'FAIL 0c: someone still has Partnerships'; end if;
  if not exists (select 1 from member_roles where team_member_id = '30000000-0000-4000-8000-0000000114a5' and role = 'editor') then raise exception 'FAIL 0c: S lost another role'; end if;
  if (select count(*) from media_kit_access where team_id = '10000000-0000-4000-8000-0000000114a0' and user_id in ('00000000-0000-4000-8000-0000000114a5', '00000000-0000-4000-8000-0000000114a6')) <> 2 then
    raise exception 'FAIL 0c: S and I should have media kit access';
  end if;
  if exists (select 1 from team_invites where 'partnerships'::role_type = any (proposed_roles)) then raise exception 'FAIL 0c: an invite still offers Partnerships'; end if;
  if not exists (select 1 from team_invites where team_id = '10000000-0000-4000-8000-0000000114a0' and proposed_roles = array['editor']::role_type[]) then raise exception 'FAIL 0c: the invite lost its other roles'; end if;
  if exists (select 1 from role_colors where role = 'partnerships') or not exists (select 1 from role_colors where team_id = '10000000-0000-4000-8000-0000000114a0' and role = 'editor') then
    raise exception 'FAIL 0c: Partnerships'' colour should go, and only it';
  end if;
  if media_kit_role_to_access() <> 0 then raise exception 'FAIL 0c: a second run gave access again'; end if;
end $$;
delete from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0';

-- 0d. M lets G in: who gave it and when are the database's (forged ones replaced). Nobody else gives it (R can't let
-- themselves in), nobody who isn't active on the team gets it (X), the person and Masters see it, the rest don't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  insert into media_kit_access (team_id, user_id, granted_by, granted_at)
  values ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a7', '00000000-0000-4000-8000-0000000114a2', '2001-01-01');
  do $$ begin
    begin
      insert into media_kit_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114b1');
      raise exception 'FAIL 0d: someone not on the team was let in';
    exception when insufficient_privilege then null;
    end;
    if (select count(*) from media_kit_access where team_id = '10000000-0000-4000-8000-0000000114a0') <> 3 then raise exception 'FAIL 0d: the master doesn''t see who''s in'; end if;
  end $$;
commit;
do $$ begin
  if (select granted_by from media_kit_access where user_id = '00000000-0000-4000-8000-0000000114a7') is distinct from '00000000-0000-4000-8000-0000000114a1'
     or (select granted_at from media_kit_access where user_id = '00000000-0000-4000-8000-0000000114a7') < now() - interval '1 minute' then
    raise exception 'FAIL 0d: who let G in, and when, should be the database''s';
  end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a2');
  set local role authenticated;
  do $$
  declare n int;
  begin
    begin
      insert into media_kit_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a2');
      raise exception 'FAIL 0d: an editor let themselves in';
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from media_kit_access) then raise exception 'FAIL 0d: an editor sees who''s in'; end if;
    delete from media_kit_access where user_id = '00000000-0000-4000-8000-0000000114a7';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 0d: an editor took someone''s access away'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a7');
  set local role authenticated;
  do $$ begin
    if (select count(*) from media_kit_access) <> 1 then raise exception 'FAIL 0d: G should see their own access, and only it'; end if;
  end $$;
rollback;

-- 1. M saves the setup; when and by whom are the database's (a forged updated_by is replaced).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  insert into media_kit_settings (team_id, settings, updated_by, updated_at)
  values ('10000000-0000-4000-8000-0000000114a0', '{"title": "Team 114", "rates": {"show": true}}', '00000000-0000-4000-8000-0000000114a2', '2001-01-01');
commit;
do $$ begin
  if (select updated_by from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from '00000000-0000-4000-8000-0000000114a1' then
    raise exception 'FAIL 1: updated_by should be the master who saved it';
  end if;
  if (select updated_at from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') < now() - interval '1 minute' then
    raise exception 'FAIL 1: updated_at should be now';
  end if;
end $$;

-- 2. M changes it, and saves the way the app does (an upsert onto the row that's there).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  update media_kit_settings set settings = '{"title": "Team 114 kit"}' where team_id = '10000000-0000-4000-8000-0000000114a0';
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "Team 114, again"}')
  on conflict (team_id) do update set settings = excluded.settings;
commit;
do $$ begin
  if (select settings->>'title' from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from 'Team 114, again' then
    raise exception 'FAIL 2: the master''s upsert was lost';
  end if;
end $$;

-- 3. S (let in) reads it, changes it and saves it like the app; the database notes S did.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$ begin
    if not exists (select 1 from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') then raise exception 'FAIL 3: someone let in can''t read the kit'; end if;
  end $$;
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "Kit by S"}')
  on conflict (team_id) do update set settings = excluded.settings;
commit;
do $$ begin
  if (select settings->>'title' from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from 'Kit by S'
     or (select updated_by from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from '00000000-0000-4000-8000-0000000114a5' then
    raise exception 'FAIL 3: the save of someone let in was lost, or not noted as theirs';
  end if;
end $$;

-- 3b. S can start the setup where there's none yet.
begin;
  delete from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0';
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "first"}');
rollback;

-- 4. R (revenue access, not let in), E (editor), P (scheduler) and I (let in, but not yet in the team): nothing, read
-- or write; R can't start one.
do $$
declare
  who uuid;
  n int;
begin
  foreach who in array array['00000000-0000-4000-8000-0000000114a2', '00000000-0000-4000-8000-0000000114a3', '00000000-0000-4000-8000-0000000114a4', '00000000-0000-4000-8000-0000000114a6']::uuid[] loop
    perform pg_temp.as_user(who);
    set local role authenticated;
    if exists (select 1 from media_kit_settings) then raise exception 'FAIL 4: % reads the kit', who; end if;
    update media_kit_settings set settings = '{}' where team_id = '10000000-0000-4000-8000-0000000114a0';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: % changed the kit', who; end if;
    reset role;
  end loop;
end $$;
begin;
  delete from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0';
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a2');
  set local role authenticated;
  do $$ begin
    begin
      insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "mine"}');
      raise exception 'FAIL 4: revenue access alone started the kit';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 5. X (another team's master): not this team's, read or write; their own, yes.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') then raise exception 'FAIL 5: another team reads the kit'; end if;
    begin
      insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{}') on conflict (team_id) do update set settings = excluded.settings;
      raise exception 'FAIL 5: another team wrote the kit';
    exception when insufficient_privilege then null;
    end;
  end $$;
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114b0', '{"title": "Other"}');
rollback;

-- 6. The setup is one object of 100 KB at most.
do $$ begin
  begin
    insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114b0', '[]');
    raise exception 'FAIL 6: a list was saved as the setup';
  exception when check_violation then null;
  end;
  begin
    insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114b0', jsonb_build_object('about', repeat('x', 100001)));
    raise exception 'FAIL 6: a setup over 100 KB was saved';
  exception when check_violation then null;
  end;
end $$;

-- 7. The cover photos' bucket: private, pictures only (no SVG), 5 MB.
do $$
declare b record;
begin
  select * into b from storage.buckets where id = 'media-kit';
  if b.id is null or b.public then raise exception 'FAIL 7: the media-kit bucket should exist and be private'; end if;
  if b.file_size_limit is distinct from 5242880 then raise exception 'FAIL 7: media-kit takes files up to %', b.file_size_limit; end if;
  if b.allowed_mime_types is null or 'image/svg+xml' = any (b.allowed_mime_types) or exists (select 1 from unnest(b.allowed_mime_types) t where t not like 'image/%') then
    raise exception 'FAIL 7: media-kit takes %', b.allowed_mime_types;
  end if;
end $$;

-- 8. M adds a cover photo to the team's folder, not to another team's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114a0/cover-1.jpg');
  do $$ begin
    begin
      insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114b0/cover-1.jpg');
      raise exception 'FAIL 8: a master added a photo to another team''s folder';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 9. S (let in) sees it, adds one, replaces it and removes it (in the team's folder only).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if not exists (select 1 from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-1.jpg') then raise exception 'FAIL 9: someone let in can''t see the cover photo'; end if;
    insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114a0/cover-2.jpg');
    update storage.objects set name = '10000000-0000-4000-8000-0000000114a0/cover-3.jpg' where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-2.jpg';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 9: someone let in couldn''t replace the photo'; end if;
    delete from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-3.jpg';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 9: someone let in couldn''t remove the photo'; end if;
    begin
      insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114b0/cover-9.jpg');
      raise exception 'FAIL 9: someone let in added a photo to another team''s folder';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 10. R (revenue access alone), E, P, I (only invited) and X don't see it and can't add one.
do $$
declare who uuid;
begin
  foreach who in array array['00000000-0000-4000-8000-0000000114a2', '00000000-0000-4000-8000-0000000114a3', '00000000-0000-4000-8000-0000000114a4', '00000000-0000-4000-8000-0000000114a6', '00000000-0000-4000-8000-0000000114b1']::uuid[] loop
    perform pg_temp.as_user(who);
    set local role authenticated;
    if exists (select 1 from storage.objects where bucket_id = 'media-kit') then raise exception 'FAIL 10: % sees the cover photo', who; end if;
    begin
      insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114a0/cover-x.jpg');
      raise exception 'FAIL 10: % added a photo', who;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- 11. M removes it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  do $$
  declare n int;
  begin
    delete from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-1.jpg';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 11: the master couldn''t remove the photo'; end if;
  end $$;
commit;

-- 12. Templates (0118). M saves one: who made it and when are the database's (forged ones replaced).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  insert into media_kit_templates (id, team_id, name, settings, created_by, created_at, updated_by, updated_at)
  values ('50000000-0000-4000-8000-0000000118a1', '10000000-0000-4000-8000-0000000114a0', 'Brand deals', '{"title": "Deals"}', '00000000-0000-4000-8000-0000000114a2', '2001-01-01', '00000000-0000-4000-8000-0000000114a2', '2001-01-01');
commit;
do $$ begin
  if (select row(created_by, updated_by) from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') is distinct from row('00000000-0000-4000-8000-0000000114a1'::uuid, '00000000-0000-4000-8000-0000000114a1'::uuid)
     or (select least(created_at, updated_at) from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') < now() - interval '1 minute' then
    raise exception 'FAIL 12: who made the template, and when, should be the database''s';
  end if;
end $$;

-- 13. G (let in by M) reads it and changes it: noted as G's, still made by M, still the team's (a move is undone).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a7');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if not exists (select 1 from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') then raise exception 'FAIL 13: someone let in can''t read the templates'; end if;
    update media_kit_templates set settings = '{"title": "Deals, again"}', created_by = '00000000-0000-4000-8000-0000000114a7', created_at = '2001-01-01', team_id = '10000000-0000-4000-8000-0000000114b0'
     where id = '50000000-0000-4000-8000-0000000118a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 13: someone let in couldn''t change a template'; end if;
  end $$;
commit;
do $$ begin
  if (select settings->>'title' from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') is distinct from 'Deals, again'
     or (select updated_by from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') is distinct from '00000000-0000-4000-8000-0000000114a7'
     or (select created_by from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') is distinct from '00000000-0000-4000-8000-0000000114a1'
     or (select created_at from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') < now() - interval '1 minute'
     or (select team_id from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1') is distinct from '10000000-0000-4000-8000-0000000114a0' then
    raise exception 'FAIL 13: the change should be G''s, the template still M''s and the team''s';
  end if;
end $$;

-- 14. A name: each once per team whatever its case, 1 to 80 characters, no spaces around it; the setup: one object of
-- 100 KB at most. Another team may use the same name.
do $$ begin
  begin
    insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114a0', 'BRAND DEALS');
    raise exception 'FAIL 14: a name was used twice on a team';
  exception when unique_violation then null;
  end;
  begin
    insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114a0', '');
    raise exception 'FAIL 14: a template with no name';
  exception when check_violation then null;
  end;
  begin
    insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114a0', ' Spaced ');
    raise exception 'FAIL 14: a name with spaces around it';
  exception when check_violation then null;
  end;
  begin
    insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114a0', repeat('x', 81));
    raise exception 'FAIL 14: a name over 80 characters';
  exception when check_violation then null;
  end;
  begin
    insert into media_kit_templates (team_id, name, settings) values ('10000000-0000-4000-8000-0000000114a0', 'List', '[]');
    raise exception 'FAIL 14: a list kept as a template';
  exception when check_violation then null;
  end;
  begin
    insert into media_kit_templates (team_id, name, settings) values ('10000000-0000-4000-8000-0000000114a0', 'Big', jsonb_build_object('about', repeat('x', 100001)));
    raise exception 'FAIL 14: a template over 100 KB';
  exception when check_violation then null;
  end;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114b1');
  set local role authenticated;
  insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114b0', 'Brand deals');
rollback;

-- 15. R (revenue access alone), E, P, I (only invited) and X (another team): don't see the templates, can't add,
-- change or delete one.
do $$
declare
  who uuid;
  n int;
begin
  foreach who in array array['00000000-0000-4000-8000-0000000114a2', '00000000-0000-4000-8000-0000000114a3', '00000000-0000-4000-8000-0000000114a4', '00000000-0000-4000-8000-0000000114a6', '00000000-0000-4000-8000-0000000114b1']::uuid[] loop
    perform pg_temp.as_user(who);
    set local role authenticated;
    if exists (select 1 from media_kit_templates where team_id = '10000000-0000-4000-8000-0000000114a0') then raise exception 'FAIL 15: % sees the templates', who; end if;
    update media_kit_templates set name = 'Mine' where id = '50000000-0000-4000-8000-0000000118a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 15: % changed a template', who; end if;
    delete from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 15: % deleted a template', who; end if;
    begin
      insert into media_kit_templates (team_id, name) values ('10000000-0000-4000-8000-0000000114a0', 'Theirs');
      raise exception 'FAIL 15: % added a template', who;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- 16. M takes G's access away: G sees nothing any more. Then G leaves the team and comes back: still nothing.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a1');
  set local role authenticated;
  delete from media_kit_access where user_id = '00000000-0000-4000-8000-0000000114a7';
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a7');
  do $$ begin
    if exists (select 1 from media_kit_templates) then raise exception 'FAIL 16: G still sees the templates after it was taken away'; end if;
  end $$;
rollback;
delete from team_members where id = '30000000-0000-4000-8000-0000000114a7';
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000114a8', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a7', 'g114@example.com', 'active');
do $$ begin
  if exists (select 1 from media_kit_access where user_id = '00000000-0000-4000-8000-0000000114a7') then raise exception 'FAIL 16: leaving the team kept the access'; end if;
end $$;

-- 17. S deletes the template.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$
  declare n int;
  begin
    delete from media_kit_templates where id = '50000000-0000-4000-8000-0000000118a1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 17: someone let in couldn''t delete a template'; end if;
  end $$;
commit;

select 'media-kit checks passed' as ok;
