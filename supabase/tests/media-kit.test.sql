-- Checks for 0114 and 0116: the media kit's setup and its cover photo. Masters and the people with the Partnerships
-- role (0115) read, start and change the setup; nobody else on the team does, revenue access alone included (0116);
-- another team never does; when and by whom is the database's; the setup is one JSON object of 100 KB at most. The
-- cover photos: a private bucket of pictures (no SVG), 5 MB; the same people read, add, replace and remove them, in
-- their own team's folder only. Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). S: Partnerships. I: Partnerships, still only invited. R: editor given revenue access. E: editor.
-- P: scheduler. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000114a1', 'm114@example.com'),
  ('00000000-0000-4000-8000-0000000114a2', 'r114@example.com'),
  ('00000000-0000-4000-8000-0000000114a3', 'e114@example.com'),
  ('00000000-0000-4000-8000-0000000114a4', 'p114@example.com'),
  ('00000000-0000-4000-8000-0000000114a5', 's114@example.com'),
  ('00000000-0000-4000-8000-0000000114a6', 'i114@example.com'),
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
  ('30000000-0000-4000-8000-0000000114a6', '10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a6', 'i114@example.com', 'invited')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000114a2', 'editor'),
  ('30000000-0000-4000-8000-0000000114a3', 'editor'),
  ('30000000-0000-4000-8000-0000000114a4', 'publisher'),
  ('30000000-0000-4000-8000-0000000114a5', 'partnerships'),
  ('30000000-0000-4000-8000-0000000114a6', 'partnerships')
on conflict do nothing;
insert into revenue_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000114a0', '00000000-0000-4000-8000-0000000114a2') on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 0. The role and the helper.
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'role_type' and e.enumlabel = 'partnerships') then
    raise exception 'FAIL 0: no Partnerships role';
  end if;
  if role_allows_stage('partnerships', 'edit') or role_allows_stage('partnerships', 'publish') then
    raise exception 'FAIL 0: Partnerships has a step of its own';
  end if;
  if has_function_privilege('anon', 'media_kit_team_ids()', 'execute') then raise exception 'FAIL 0: anon may ask media_kit_team_ids()'; end if;
  -- 0114's rules are gone (revenue people reading, Masters alone writing).
  if exists (select 1 from pg_policies where policyname in ('revenue people read the media kit', 'masters start the media kit', 'masters change the media kit', 'media kit: revenue people read', 'media kit: masters add', 'media kit: masters replace', 'media kit: masters remove')) then
    raise exception 'FAIL 0: an old media kit rule is still there';
  end if;
end $$;

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

-- 3. S (Partnerships) reads it, changes it and saves it like the app; the database notes S did.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$ begin
    if not exists (select 1 from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') then raise exception 'FAIL 3: Partnerships can''t read the kit'; end if;
  end $$;
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "Partnerships kit"}')
  on conflict (team_id) do update set settings = excluded.settings;
commit;
do $$ begin
  if (select settings->>'title' from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from 'Partnerships kit'
     or (select updated_by from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0') is distinct from '00000000-0000-4000-8000-0000000114a5' then
    raise exception 'FAIL 3: the Partnerships save was lost, or not noted as theirs';
  end if;
end $$;

-- 3b. S can start the setup where there's none yet.
begin;
  delete from media_kit_settings where team_id = '10000000-0000-4000-8000-0000000114a0';
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  insert into media_kit_settings (team_id, settings) values ('10000000-0000-4000-8000-0000000114a0', '{"title": "first"}');
rollback;

-- 4. R (revenue access, no Partnerships), E (editor), P (scheduler) and I (Partnerships, not yet in the team): nothing,
-- read or write; R can't start one.
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

-- 9. S sees it, adds one, replaces it and removes it (in the team's folder only).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000114a5');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if not exists (select 1 from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-1.jpg') then raise exception 'FAIL 9: Partnerships can''t see the cover photo'; end if;
    insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114a0/cover-2.jpg');
    update storage.objects set name = '10000000-0000-4000-8000-0000000114a0/cover-3.jpg' where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-2.jpg';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 9: Partnerships couldn''t replace the photo'; end if;
    delete from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000114a0/cover-3.jpg';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL 9: Partnerships couldn''t remove the photo'; end if;
    begin
      insert into storage.objects (bucket_id, name) values ('media-kit', '10000000-0000-4000-8000-0000000114b0/cover-9.jpg');
      raise exception 'FAIL 9: Partnerships added a photo to another team''s folder';
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

select 'media-kit checks passed' as ok;
