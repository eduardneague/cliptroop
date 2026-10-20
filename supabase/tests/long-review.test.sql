-- Checks for 0089: long videos reviewed in ClipTroop (versions, notes, the
-- review gate, the approved version, the keep switch), the files settings,
-- Thumbnail Studio's extra titles and search's winning thumbnail. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team G9 (its owner), E = editor in G9, V = researcher
-- in G9, K = packager in G9, O = master of team H9.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000091', 'm9@example.com'),
  ('00000000-0000-4000-8000-000000000092', 'e9@example.com'),
  ('00000000-0000-4000-8000-000000000093', 'v9@example.com'),
  ('00000000-0000-4000-8000-000000000094', 'k9@example.com'),
  ('00000000-0000-4000-8000-000000000095', 'o9@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000091', 'm9@example.com'),
  ('00000000-0000-4000-8000-000000000092', 'e9@example.com'),
  ('00000000-0000-4000-8000-000000000093', 'v9@example.com'),
  ('00000000-0000-4000-8000-000000000094', 'k9@example.com'),
  ('00000000-0000-4000-8000-000000000095', 'o9@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000000091', 'Team G9', 'long-review-g9', '00000000-0000-4000-8000-000000000091'),
  ('10000000-0000-4000-8000-000000000092', 'Team H9', 'long-review-h9', '00000000-0000-4000-8000-000000000095')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 'e9@example.com', 'active'),
  ('20000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000093', 'v9@example.com', 'active'),
  ('20000000-0000-4000-8000-000000000094', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000094', 'k9@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-000000000092', 'editor'),
  ('20000000-0000-4000-8000-000000000093', 'researcher'),
  ('20000000-0000-4000-8000-000000000094', 'packager')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Videos: P (G9, at Edit), R (G9, at Edit, nothing uploaded), Q (H9, at Edit).
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', 'The tech market is about to break', 'edit', '00000000-0000-4000-8000-000000000091'),
  ('30000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000091', 'Nothing uploaded yet', 'edit', '00000000-0000-4000-8000-000000000091'),
  ('30000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-000000000092', 'Another team''s video', 'edit', '00000000-0000-4000-8000-000000000095');
-- The files the browser uploaded (straight to storage).
insert into storage.objects (bucket_id, name) values
  ('long-review-videos', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/a.mp4'),
  ('long-review-videos', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/b.mp4'),
  ('long-review-videos', '10000000-0000-4000-8000-000000000092/30000000-0000-4000-8000-000000000093/c.mp4');

-- 1. The bucket: private, files up to 3 GB.
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'long-review-videos' and public = false and file_size_limit = 3221225472) then
    raise exception 'FAIL 1: the long-review-videos bucket should be private, 3 GB a file';
  end if;
end $$;

-- 2. Versions: the editor adds v1 (numbered, the team and uploader set by the database); a researcher can't; never outside the folder.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  insert into long_video_versions (project_id, storage_path, file_name, size_bytes, mime_type, version_number, team_id)
  values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/a.mp4', 'edit-v1.mp4', 2147483648, 'video/mp4', 99, '10000000-0000-4000-8000-000000000092');
  do $$ declare v record; begin
    select * into v from long_video_versions where project_id = '30000000-0000-4000-8000-000000000091';
    if v.version_number <> 1 or v.team_id <> '10000000-0000-4000-8000-000000000091' or v.uploaded_by <> '00000000-0000-4000-8000-000000000092' then
      raise exception 'FAIL 2: v1 should be numbered 1 in team G9 by the editor (got %, %, %)', v.version_number, v.team_id, v.uploaded_by;
    end if;
    begin
      insert into long_video_versions (project_id, storage_path, file_name, size_bytes, mime_type, version_number, team_id)
      values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000092/a.mp4', 'x.mp4', 10, 'video/mp4', 0, '10000000-0000-4000-8000-000000000091');
      raise exception 'FAIL 2: a file in another video''s folder was accepted';
    exception when check_violation then null;
    end;
    begin
      insert into long_video_versions (project_id, storage_path, file_name, size_bytes, mime_type, version_number, team_id)
      values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/never-uploaded.mp4', 'x.mp4', 10, 'video/mp4', 0, '10000000-0000-4000-8000-000000000091');
      raise exception 'FAIL 2: a version without its file was accepted';
    exception when check_violation then null;
    end;
    begin
      update long_video_versions set file_name = 'renamed.mp4' where project_id = '30000000-0000-4000-8000-000000000091';
      raise exception 'FAIL 2: a person changed a version';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000093');
  set local role authenticated;
  do $$ begin
    insert into long_video_versions (project_id, storage_path, file_name, size_bytes, mime_type, version_number, team_id)
    values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/b.mp4', 'v2.mp4', 10, 'video/mp4', 0, '10000000-0000-4000-8000-000000000091');
    raise exception 'FAIL 2: a researcher uploaded a version';
  exception when insufficient_privilege then null;
  end $$;
rollback;
-- The master adds v2.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000091');
  set local role authenticated;
  insert into long_video_versions (project_id, storage_path, file_name, size_bytes, mime_type, version_number, team_id)
  values ('30000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/b.mp4', 'edit-v2.mp4', 1048576, 'video/quicktime', 0, '10000000-0000-4000-8000-000000000091');
commit;
do $$ begin
  if (select max(version_number) from long_video_versions where project_id = '30000000-0000-4000-8000-000000000091') <> 2 then
    raise exception 'FAIL 2: the master''s upload should be v2';
  end if;
end $$;

-- 3. Notes: a teammate notes a moment; a reply keeps it; another team sees nothing and can't write.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000093');
  set local role authenticated;
  insert into long_video_comments (version_id, project_id, body, time_sec)
  select id, '30000000-0000-4000-8000-000000000093', '  Cut the pause here  ', 12.5 from long_video_versions
   where project_id = '30000000-0000-4000-8000-000000000091' and version_number = 1;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  insert into long_video_comments (version_id, project_id, parent_id, body, time_sec)
  select c.version_id, c.project_id, c.id, 'Done', 99 from long_video_comments c where c.body = 'Cut the pause here';
  do $$ begin
    if (select project_id from long_video_comments where body = 'Cut the pause here') <> '30000000-0000-4000-8000-000000000091' then
      raise exception 'FAIL 3: a note belongs to its version''s video, whatever was sent';
    end if;
    if (select time_sec from long_video_comments where body = 'Done') <> 12.5 then
      raise exception 'FAIL 3: a reply keeps the moment of the note it answers';
    end if;
    begin
      update long_video_comments set body = 'Changed by someone else' where body = 'Cut the pause here';
      raise exception 'FAIL 3: someone edited another person''s note';
    exception when insufficient_privilege then null;
    end;
    update long_video_comments set resolved_at = now() where body = 'Cut the pause here';
    if (select resolved_by from long_video_comments where body = 'Cut the pause here') <> '00000000-0000-4000-8000-000000000092' then
      raise exception 'FAIL 3: resolving records who did it';
    end if;
  end $$;
commit;
select set_config('test.v1', (select id::text from long_video_versions where project_id = '30000000-0000-4000-8000-000000000091' and version_number = 1), false);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000095');
  set local role authenticated;
  do $$ begin
    if (select count(*) from long_video_comments) <> 0 or (select count(*) from long_video_versions) <> 0 then
      raise exception 'FAIL 3: another team reads team G9''s versions or notes';
    end if;
    begin
      insert into long_video_comments (version_id, project_id, body)
      values (current_setting('test.v1')::uuid, '30000000-0000-4000-8000-000000000091', 'Sneaky');
      raise exception 'FAIL 3: another team wrote a note';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 4. Reviewed in ClipTroop: Edit → Review needs an upload; approving locks in the latest version.
update teams set long_in_app_review = true where id = '10000000-0000-4000-8000-000000000091';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  do $$ begin
    begin
      perform long_mark_edited('30000000-0000-4000-8000-000000000092', 'Done');
      raise exception 'FAIL 4: editing was marked complete without an upload';
    exception when check_violation then null;
    end;
    perform long_mark_edited('30000000-0000-4000-8000-000000000091', 'Ready');
  end $$;
commit;
do $$ begin
  if (select stage from long_video_projects where id = '30000000-0000-4000-8000-000000000091') <> 'review' then
    raise exception 'FAIL 4: with an upload, the video moves to Review';
  end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000091');
  set local role authenticated;
  select long_review('30000000-0000-4000-8000-000000000091', true, null);
commit;
do $$ begin
  if (select stage from long_video_projects where id = '30000000-0000-4000-8000-000000000091') <> 'package' then
    raise exception 'FAIL 4: approving moves it to Package';
  end if;
  if (select v.version_number from long_video_projects p join long_video_versions v on v.id = p.approved_version_id where p.id = '30000000-0000-4000-8000-000000000091') <> 2 then
    raise exception 'FAIL 4: the approved version is the latest (v2)';
  end if;
end $$;
-- The team's choice off, the video's own on: still needs the upload.
update teams set long_in_app_review = false where id = '10000000-0000-4000-8000-000000000091';
update long_video_projects set in_app_review = true where id = '30000000-0000-4000-8000-000000000092';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  do $$ begin
    begin
      perform long_mark_edited('30000000-0000-4000-8000-000000000092', 'Done');
      raise exception 'FAIL 4: the video''s own setting is ignored';
    exception when check_violation then null;
    end;
  end $$;
rollback;
-- Both off: the old way (no upload needed).
update long_video_projects set in_app_review = null where id = '30000000-0000-4000-8000-000000000092';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  select long_mark_edited('30000000-0000-4000-8000-000000000092', 'Done');
rollback;

-- 5. The approved version and the keep switch: never set directly; the keep switch is the master's and schedulers'.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000091');
  set local role authenticated;
  update long_video_projects set approved_version_id = (select id from long_video_versions where project_id = '30000000-0000-4000-8000-000000000091' and version_number = 1), keep_media = true
   where id = '30000000-0000-4000-8000-000000000091';
  do $$ begin
    if (select v.version_number from long_video_projects p join long_video_versions v on v.id = p.approved_version_id where p.id = '30000000-0000-4000-8000-000000000091') <> 2 then
      raise exception 'FAIL 5: the approved version was changed directly';
    end if;
    if (select keep_media from long_video_projects where id = '30000000-0000-4000-8000-000000000091') then
      raise exception 'FAIL 5: keep_media was changed directly';
    end if;
    perform long_set_keep_media('30000000-0000-4000-8000-000000000091', true);
    if not (select keep_media from long_video_projects where id = '30000000-0000-4000-8000-000000000091') then
      raise exception 'FAIL 5: the master keeps the files';
    end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  do $$ begin
    perform long_set_keep_media('30000000-0000-4000-8000-000000000091', false);
    raise exception 'FAIL 5: an editor changed the keep switch';
  exception when insufficient_privilege then null;
  end $$;
rollback;
-- How the video is reviewed: the editor (who may edit the video at Edit) can't switch the upload rule off; the master can.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000092');
  set local role authenticated;
  do $$ begin
    update long_video_projects set in_app_review = false where id = '30000000-0000-4000-8000-000000000092';
    if found then raise exception 'FAIL 5: an editor changed how the video is reviewed'; end if;
    raise exception 'FAIL 5: the editor''s update should reach the guard (RLS let nothing through)';
  exception when insufficient_privilege then null;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000091');
  set local role authenticated;
  update long_video_projects set in_app_review = true where id = '30000000-0000-4000-8000-000000000092';
  do $$ begin
    if not (select in_app_review from long_video_projects where id = '30000000-0000-4000-8000-000000000092') then
      raise exception 'FAIL 5: the master chooses how the video is reviewed';
    end if;
  end $$;
rollback;

-- 6. How long files stay: 1 week and 30 days by default; only the choices.
do $$ begin
  if (select long_media_keep_days from teams where id = '10000000-0000-4000-8000-000000000092') <> 7 then
    raise exception 'FAIL 6: long video files stay 1 week by default';
  end if;
  if (select studio_keep_days from teams where id = '10000000-0000-4000-8000-000000000092') <> 30 then
    raise exception 'FAIL 6: thumbnails that didn''t win stay 30 days by default';
  end if;
  begin
    update teams set long_media_keep_days = 5 where id = '10000000-0000-4000-8000-000000000092';
    raise exception 'FAIL 6: 5 days isn''t one of the choices';
  exception when check_violation then null;
  end;
  update teams set studio_keep_days = null where id = '10000000-0000-4000-8000-000000000092';
  update teams set studio_keep_days = 30 where id = '10000000-0000-4000-8000-000000000092';
end $$;

-- 7. More titles to try: the packager adds them (tidied, numbered); teammates read; a researcher can't add; another team sees none.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000094');
  set local role authenticated;
  insert into package_titles (project_id, title) values ('30000000-0000-4000-8000-000000000091', '  The   tech market   is breaking ');
  insert into package_titles (project_id, title) values ('30000000-0000-4000-8000-000000000091', 'Nobody saw this coming');
commit;
do $$ begin
  if (select string_agg(title || '@' || position, ' | ' order by position) from package_titles where project_id = '30000000-0000-4000-8000-000000000091')
     <> 'The tech market is breaking@1 | Nobody saw this coming@2' then
    raise exception 'FAIL 7: titles are tidied and numbered (got %)', (select string_agg(title || '@' || position, ' | ' order by position) from package_titles);
  end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000093');
  set local role authenticated;
  do $$ begin
    if (select count(*) from package_titles) <> 2 then raise exception 'FAIL 7: teammates read the titles'; end if;
    begin
      insert into package_titles (project_id, title) values ('30000000-0000-4000-8000-000000000091', 'Not mine to add');
      raise exception 'FAIL 7: a researcher added a title';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000095');
  set local role authenticated;
  do $$ begin
    if (select count(*) from package_titles) <> 0 then raise exception 'FAIL 7: another team reads the titles'; end if;
  end $$;
rollback;

-- 8. Search: the Studio's winner is the video's picture.
insert into package_entries (id, project_id, title, thumbnail_storage_path, is_winner) values
  ('40000000-0000-4000-8000-000000000091', '30000000-0000-4000-8000-000000000091', 'A', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/a.jpg', false),
  ('40000000-0000-4000-8000-000000000092', '30000000-0000-4000-8000-000000000091', 'B', '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/b.jpg', true);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000093');
  set local role authenticated;
  do $$ declare r jsonb; n int; begin
    select entry_number into n from long_video_projects where id = '30000000-0000-4000-8000-000000000091';
    r := global_search('#' || n, 6);
    if (select x->>'winner_id' from jsonb_array_elements(r->'projects') x where x->>'id' = '30000000-0000-4000-8000-000000000091') is distinct from '40000000-0000-4000-8000-000000000092' then
      raise exception 'FAIL 8: search should carry the winning thumbnail (got %)', r->'projects';
    end if;
  end $$;
rollback;

-- 9. The developer's Usage page: long videos' files count in their team's storage and in the video counts.
update storage.objects set metadata = jsonb_build_object('size', '2147483648')
 where bucket_id = 'long-review-videos' and name = '10000000-0000-4000-8000-000000000091/30000000-0000-4000-8000-000000000091/a.mp4';
do $$ declare r jsonb; t jsonb; begin
  r := developer_usage();
  select x into t from jsonb_array_elements(r->'teams') x where x->>'id' = '10000000-0000-4000-8000-000000000091';
  if (t->>'storageBytes')::bigint < 2147483648 then
    raise exception 'FAIL 9: the team''s storage should count its long video files (got %)', t->>'storageBytes';
  end if;
  if (t->>'videoFiles')::int < (select count(*) from long_video_versions where team_id = '10000000-0000-4000-8000-000000000091' and deleted_at is null) then
    raise exception 'FAIL 9: the team''s video files should count long video versions (got %)', t->>'videoFiles';
  end if;
  if (r->'counts'->>'videoBytes')::bigint < (select coalesce(sum(size_bytes), 0) from long_video_versions where deleted_at is null) then
    raise exception 'FAIL 9: the video bytes should count long video versions';
  end if;
end $$;
