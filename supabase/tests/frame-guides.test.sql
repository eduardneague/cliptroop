-- Checks for 0133 (Frame Guides): the team sees, adds and changes its frames, collections and categories, nobody else
-- does; numbers are the team's next and never change; a frame's pictures are in its own folder; keywords are kept
-- tidy; a category that goes leaves every frame; whoever added one, or a master, deletes it; a frame guide on a script's
-- words has the team's frame, keeps its place when the frame goes, and comes along when comments are copied. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team F (its owner), S = scripter of video V on F, R = researcher on F, O = owner of team G.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000013301', 'm-f@example.com'),
  ('00000000-0000-4000-8000-000000013302', 's-f@example.com'),
  ('00000000-0000-4000-8000-000000013303', 'r-f@example.com'),
  ('00000000-0000-4000-8000-000000013304', 'o-g@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000013301', 'm-f@example.com'),
  ('00000000-0000-4000-8000-000000013302', 's-f@example.com'),
  ('00000000-0000-4000-8000-000000013303', 'r-f@example.com'),
  ('00000000-0000-4000-8000-000000013304', 'o-g@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000013301', 'Team F', 'frame-guides-f', '00000000-0000-4000-8000-000000013301'),
  ('10000000-0000-4000-8000-000000013302', 'Team G', 'frame-guides-g', '00000000-0000-4000-8000-000000013304')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-000000013302', '10000000-0000-4000-8000-000000013301', '00000000-0000-4000-8000-000000013302', 's-f@example.com', 'active'),
  ('20000000-0000-4000-8000-000000013303', '10000000-0000-4000-8000-000000013301', '00000000-0000-4000-8000-000000013303', 'r-f@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-000000013302', 'scripter'),
  ('20000000-0000-4000-8000-000000013303', 'researcher')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013301', 'Frames', 'script', '00000000-0000-4000-8000-000000013301')
on conflict do nothing;
insert into long_video_scripters (project_id, team_member_id) values
  ('30000000-0000-4000-8000-000000013301', '20000000-0000-4000-8000-000000013302')
on conflict do nothing;
insert into scripts (id, long_video_id, kind, name, position, step, content_text) values
  ('70000000-0000-4000-8000-000000013301', '30000000-0000-4000-8000-000000013301', 'script', 'Script', 1, 'write', 'Open on the desk. Then the reveal.'),
  ('70000000-0000-4000-8000-000000013302', '30000000-0000-4000-8000-000000013301', 'script', 'Review', 2, 'review', 'Open on the desk. Then the reveal.')
on conflict do nothing;

-- 1. S makes a collection and two frames: numbered 1 and 2 (whatever was sent), tidy keywords, by S.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  insert into frame_collections (id, team_id, name, color) values
    ('40000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013301', '  Talking heads ', 'teal');
  insert into frame_guides (id, team_id, collection_id, number, title, keywords, categories, image_path, thumb_path, width, height, tint) values
    ('50000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013301', '40000000-0000-4000-8000-000000013301', 99, ' Desk, window light ',
     array[' Desk', 'desk', 'WINDOW light', '', 'desk '], array['b-roll', 'close-up', 'b-roll'],
     '10000000-0000-4000-8000-000000013301/50000000-0000-4000-8000-000000013301/a.webp',
     '10000000-0000-4000-8000-000000013301/50000000-0000-4000-8000-000000013301/a-s.webp', 1920, 1080, '#336699');
  insert into frame_guides (id, team_id, collection_id, image_path) values
    ('50000000-0000-4000-8000-000000013302', '10000000-0000-4000-8000-000000013301', '40000000-0000-4000-8000-000000013301',
     '10000000-0000-4000-8000-000000013301/50000000-0000-4000-8000-000000013302/b.webp');
  do $$ declare f record; begin
    select * into f from frame_guides where id = '50000000-0000-4000-8000-000000013301';
    if f.number <> 1 or (select number from frame_guides where id = '50000000-0000-4000-8000-000000013302') <> 2 then
      raise exception 'FAIL 1: frames are numbered 1, 2 (got %)', f.number;
    end if;
    if f.keywords <> array['desk', 'window light'] or f.categories <> array['b-roll', 'close-up'] or f.title <> 'Desk, window light' then
      raise exception 'FAIL 1: keywords and categories kept tidy (got % / % / %)', f.keywords, f.categories, f.title;
    end if;
    if f.created_by is distinct from '00000000-0000-4000-8000-000000013302'::uuid then
      raise exception 'FAIL 1: a frame is its adder''s';
    end if;
    if (select name from frame_collections where id = '40000000-0000-4000-8000-000000013301') <> 'Talking heads' then
      raise exception 'FAIL 1: a collection''s name is trimmed';
    end if;
  end $$;
commit;

-- 2. What can't be: a picture outside its folder, another team's collection, a made-up key, a category that isn't
--    the team's, a changed number or team, a second collection of the same name.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  do $$ begin
    begin
      insert into frame_guides (id, team_id, collection_id, image_path) values
        ('50000000-0000-4000-8000-000000013309', '10000000-0000-4000-8000-000000013301', '40000000-0000-4000-8000-000000013301',
         '10000000-0000-4000-8000-000000013301/50000000-0000-4000-8000-000000013301/stolen.webp');
      raise exception 'FAIL 2: a picture from another frame''s folder was let in';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into frame_guides (id, team_id, collection_id, image_path) values
        ('50000000-0000-4000-8000-000000013309', '10000000-0000-4000-8000-000000013301', '40000000-0000-4000-8000-000000013301',
         '10000000-0000-4000-8000-000000013301/50000000-0000-4000-8000-000000013309/../x.webp');
      raise exception 'FAIL 2: a picture path with .. was let in';
    exception when insufficient_privilege then null;
    end;
    begin
      update frame_guides set categories = array['Close up!'] where id = '50000000-0000-4000-8000-000000013301';
      raise exception 'FAIL 2: a made-up category key was let in';
    exception when check_violation then null;
    end;
    begin
      update frame_guides set categories = array['c:00000000-0000-4000-8000-000000000000'] where id = '50000000-0000-4000-8000-000000013301';
      raise exception 'FAIL 2: a category that isn''t the team''s was let in';
    exception when insufficient_privilege then null;
    end;
    begin
      update frame_guides set number = 7 where id = '50000000-0000-4000-8000-000000013301';
      raise exception 'FAIL 2: a frame''s number changed';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into frame_collections (team_id, name) values ('10000000-0000-4000-8000-000000013301', 'TALKING HEADS');
      raise exception 'FAIL 2: two collections of the same name';
    exception when unique_violation then null;
    end;
    begin
      update frame_guides set source_url = 'javascript:alert(1)' where id = '50000000-0000-4000-8000-000000013301';
      raise exception 'FAIL 2: a link that isn''t a web address was let in';
    exception when check_violation then null;
    end;
  end $$;
commit;

-- 3. Team G's owner sees none of it, can't add to it, and can't put a frame of G's in F's collection.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013304');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from frame_guides where team_id = '10000000-0000-4000-8000-000000013301')
       or exists (select 1 from frame_collections where team_id = '10000000-0000-4000-8000-000000013301') then
      raise exception 'FAIL 3: another team sees F''s frames';
    end if;
    begin
      insert into frame_collections (team_id, name) values ('10000000-0000-4000-8000-000000013301', 'Mine now');
      raise exception 'FAIL 3: another team added a collection to F';
    exception when insufficient_privilege then null;
    end;
    insert into frame_collections (id, team_id, name) values ('40000000-0000-4000-8000-000000013302', '10000000-0000-4000-8000-000000013302', 'G''s');
    begin
      insert into frame_guides (id, team_id, collection_id, image_path) values
        ('50000000-0000-4000-8000-000000013308', '10000000-0000-4000-8000-000000013302', '40000000-0000-4000-8000-000000013301',
         '10000000-0000-4000-8000-000000013302/50000000-0000-4000-8000-000000013308/g.webp');
      raise exception 'FAIL 3: a frame of G''s went into F''s collection';
    exception when insufficient_privilege then null;
    end;
    update frame_guides set title = 'Taken' where id = '50000000-0000-4000-8000-000000013301';
    delete from frame_guides where id = '50000000-0000-4000-8000-000000013301';
  end $$;
commit;
do $$ begin
  if (select title from frame_guides where id = '50000000-0000-4000-8000-000000013301') <> 'Desk, window light' then
    raise exception 'FAIL 3: another team changed or deleted F''s frame';
  end if;
  if (select number from frame_guides where id = '50000000-0000-4000-8000-000000013302') <> 2 then
    raise exception 'FAIL 3: numbers are each team''s own';
  end if;
end $$;

-- 4. R (on the team, didn't add it) changes a frame and adds a category of the team's own; can't delete S's frame.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013303');
  set local role authenticated;
  insert into frame_categories (id, team_id, name, color) values ('60000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013301', 'Hero shots', 'pink');
  update frame_guides set categories = categories || array['c:60000000-0000-4000-8000-000000013301'], creator = ' Someone '
   where id = '50000000-0000-4000-8000-000000013301';
  delete from frame_guides where id = '50000000-0000-4000-8000-000000013302';
  do $$ begin
    if (select categories from frame_guides where id = '50000000-0000-4000-8000-000000013301') <> array['b-roll', 'close-up', 'c:60000000-0000-4000-8000-000000013301'] then
      raise exception 'FAIL 4: a teammate tags a frame with the team''s own category';
    end if;
    if not exists (select 1 from frame_guides where id = '50000000-0000-4000-8000-000000013302') then
      raise exception 'FAIL 4: a teammate deleted someone else''s frame';
    end if;
  end $$;
commit;

-- 5. A frame guide on a script's words: the team's frame, words optional; without a frame, or another team's, no.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  insert into script_comments (id, script_id, quote, occurrence, body, kind, frame_id) values
    ('80000000-0000-4000-8000-000000013301', '70000000-0000-4000-8000-000000013301', 'Open on the desk.', 0, '', 'frame', '50000000-0000-4000-8000-000000013302');
  insert into script_comments (id, script_id, quote, occurrence, body, kind, frame_id) values
    ('80000000-0000-4000-8000-000000013302', '70000000-0000-4000-8000-000000013301', 'Then the reveal.', 0, 'Like this', 'comment', '50000000-0000-4000-8000-000000013301');
  do $$ begin
    if (select frame_id from script_comments where id = '80000000-0000-4000-8000-000000013302') is not null then
      raise exception 'FAIL 5: only a frame guide keeps a frame';
    end if;
    begin
      insert into script_comments (script_id, quote, occurrence, body, kind) values ('70000000-0000-4000-8000-000000013301', 'Then the reveal.', 0, '', 'frame');
      raise exception 'FAIL 5: a frame guide without a frame';
    exception when check_violation then null;
    end;
    begin
      insert into script_comments (script_id, quote, occurrence, body, kind) values ('70000000-0000-4000-8000-000000013301', 'Then the reveal.', 0, '   ', 'comment');
      raise exception 'FAIL 5: a comment still needs words';
    exception when check_violation then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013304');
  set local role authenticated;
  insert into frame_guides (id, team_id, collection_id, image_path) values
    ('50000000-0000-4000-8000-000000013307', '10000000-0000-4000-8000-000000013302', '40000000-0000-4000-8000-000000013302',
     '10000000-0000-4000-8000-000000013302/50000000-0000-4000-8000-000000013307/g.webp');
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  do $$ begin
    begin
      insert into script_comments (script_id, quote, occurrence, body, kind, frame_id) values
        ('70000000-0000-4000-8000-000000013301', 'Then the reveal.', 0, '', 'frame', '50000000-0000-4000-8000-000000013307');
      raise exception 'FAIL 5: a frame guide with another team''s frame';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 6. Copying the comments brings the frame along; only S (its author) changes which frame it is.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  select script_copy_comments('70000000-0000-4000-8000-000000013301', '70000000-0000-4000-8000-000000013302', '[]'::jsonb);
  do $$ begin
    if (select frame_id from script_comments where script_id = '70000000-0000-4000-8000-000000013302' and kind = 'frame') is distinct from '50000000-0000-4000-8000-000000013302'::uuid then
      raise exception 'FAIL 6: a copied frame guide keeps its frame';
    end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013301');
  set local role authenticated;
  do $$ begin
    begin
      update script_comments set frame_id = '50000000-0000-4000-8000-000000013301' where id = '80000000-0000-4000-8000-000000013301';
      raise exception 'FAIL 6: someone else changed the frame of S''s frame guide';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 7. The master deletes the category (it leaves the frame) and frame #2 (its frame guides stay on their words,
--    without a frame); S deletes its own collection, and its frames go with it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013301');
  set local role authenticated;
  delete from frame_categories where id = '60000000-0000-4000-8000-000000013301';
  delete from frame_guides where id = '50000000-0000-4000-8000-000000013302';
  do $$ begin
    if (select categories from frame_guides where id = '50000000-0000-4000-8000-000000013301') <> array['b-roll', 'close-up'] then
      raise exception 'FAIL 7: a deleted category leaves every frame';
    end if;
    if exists (select 1 from frame_guides where id = '50000000-0000-4000-8000-000000013302') then
      raise exception 'FAIL 7: a master deletes any frame';
    end if;
    if (select count(*) from script_comments where kind = 'frame' and frame_id is null and script_id in ('70000000-0000-4000-8000-000000013301', '70000000-0000-4000-8000-000000013302')) <> 2 then
      raise exception 'FAIL 7: frame guides on words stay when their frame goes';
    end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013302');
  set local role authenticated;
  delete from frame_collections where id = '40000000-0000-4000-8000-000000013301';
  do $$ begin
    if exists (select 1 from frame_guides where collection_id = '40000000-0000-4000-8000-000000013301') then
      raise exception 'FAIL 7: a collection''s frames go with it';
    end if;
  end $$;
commit;

-- 8. The new bucket is a team's own folder; App setup's check is the service key's only.
do $$ begin
  if public.storage_team_of('frame-guides', '10000000-0000-4000-8000-000000013301/x/y.webp') is distinct from '10000000-0000-4000-8000-000000013301'::uuid then
    raise exception 'FAIL 8: frame pictures are the team''s';
  end if;
  if not public.frame_guides_ready() then
    raise exception 'FAIL 8: frame_guides_ready';
  end if;
  if has_function_privilege('authenticated', 'public.frame_guides_ready()', 'execute') then
    raise exception 'FAIL 8: frame_guides_ready is the service key''s';
  end if;
  if not exists (select 1 from storage.buckets where id = 'frame-guides' and public and file_size_limit = 5242880) then
    raise exception 'FAIL 8: the frame-guides bucket';
  end if;
end $$;

-- Clean up (the next test files start from their own people).
delete from script_comments where script_id in ('70000000-0000-4000-8000-000000013301', '70000000-0000-4000-8000-000000013302');
delete from frame_guides where team_id in ('10000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013302');
delete from frame_collections where team_id in ('10000000-0000-4000-8000-000000013301', '10000000-0000-4000-8000-000000013302');

select 'frame-guides: ok';
