-- Checks for 0092: comments and editing ideas copied with their document
-- (script_copy_comments, and the insert trigger's copy mode). Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team C2 (its owner), S = scripter of video P,
-- R = researcher in C2 (not on the script), O = master of team D2.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009e1', 'm-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e2', 's-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e3', 'r-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e4', 'o-d2@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000009e1', 'm-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e2', 's-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e3', 'r-c2@example.com'),
  ('00000000-0000-4000-8000-0000000009e4', 'o-d2@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000009e1', 'Team C2', 'comment-copies-c2', '00000000-0000-4000-8000-0000000009e1'),
  ('10000000-0000-4000-8000-0000000009e2', 'Team D2', 'comment-copies-d2', '00000000-0000-4000-8000-0000000009e4')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000009e2', '10000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-0000000009e2', 's-c2@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000009e3', '10000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-0000000009e3', 'r-c2@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000009e2', 'scripter'),
  ('20000000-0000-4000-8000-0000000009e3', 'researcher')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Videos: P and Q in C2 (S scripts P), X in D2. P has Script, Review and Version 4; Q has a Script.
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-0000000009e1', '10000000-0000-4000-8000-0000000009e1', 'You soon won''t need a PS5', 'script', '00000000-0000-4000-8000-0000000009e1'),
  ('30000000-0000-4000-8000-0000000009e2', '10000000-0000-4000-8000-0000000009e1', 'Another video', 'script', '00000000-0000-4000-8000-0000000009e1'),
  ('30000000-0000-4000-8000-0000000009e3', '10000000-0000-4000-8000-0000000009e2', 'Team D2 video', 'script', '00000000-0000-4000-8000-0000000009e4');
insert into long_video_scripters (project_id, team_member_id) values
  ('30000000-0000-4000-8000-0000000009e1', '20000000-0000-4000-8000-0000000009e2')
on conflict do nothing;
insert into scripts (id, long_video_id, kind, name, position, step, content_text) values
  ('70000000-0000-4000-8000-0000000009e1', '30000000-0000-4000-8000-0000000009e1', 'script', 'Script', 1, 'write', 'This is God of War running on my PC at 60fps.'),
  ('70000000-0000-4000-8000-0000000009e2', '30000000-0000-4000-8000-0000000009e1', 'script', 'Review', 2, 'review', ''),
  ('70000000-0000-4000-8000-0000000009e3', '30000000-0000-4000-8000-0000000009e1', 'script', 'Version 4', 4, null, ''),
  ('70000000-0000-4000-8000-0000000009e4', '30000000-0000-4000-8000-0000000009e2', 'script', 'Script', 1, 'write', ''),
  ('70000000-0000-4000-8000-0000000009e5', '30000000-0000-4000-8000-0000000009e3', 'script', 'Script', 1, 'write', '');

-- 1. Writing a comment is unchanged: the writer and now, whatever is sent.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e2');
  set local role authenticated;
  insert into script_comments (id, script_id, quote, occurrence, body, kind, author_id, created_at)
  values ('80000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e1', 'God of War', 0, 'Show the FPS counter here', 'comment', '00000000-0000-4000-8000-0000000009e4', '2020-01-01');
  insert into script_comments (id, script_id, quote, occurrence, body, kind)
  values ('80000000-0000-4000-8000-0000000009e2', '70000000-0000-4000-8000-0000000009e1', 'at 60fps', 0, 'Split screen with the PS5', 'edit_idea');
  do $$ declare c record; begin
    select * into c from script_comments where id = '80000000-0000-4000-8000-0000000009e1';
    if c.author_id <> '00000000-0000-4000-8000-0000000009e2' or c.created_at < now() - interval '1 minute' or c.team_id <> '10000000-0000-4000-8000-0000000009e1' then
      raise exception 'FAIL 1: a new comment is the writer''s, from now, in the document''s team (got %, %, %)', c.author_id, c.created_at, c.team_id;
    end if;
  end $$;
commit;
-- The master resolves the editing idea; the comment gets an older date (as if written days ago).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  update script_comments set resolved_at = now() where id = '80000000-0000-4000-8000-0000000009e2';
commit;
alter table script_comments disable trigger script_comments_write;
update script_comments set created_at = now() - interval '3 days' where id = '80000000-0000-4000-8000-0000000009e1';
alter table script_comments enable trigger script_comments_write;

-- 2. The scripter copies them into Review: the same words, author, date and resolved state; the ids asked for.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e2');
  set local role authenticated;
  do $$ declare ids jsonb; a record; b record; begin
    ids := script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e2',
      '[{"id": "80000000-0000-4000-8000-0000000009e1", "new_id": "80000000-0000-4000-8000-0000000009f1", "sketch": false}]'::jsonb);
    if jsonb_array_length(ids) <> 2 or not ids ? '80000000-0000-4000-8000-0000000009f1' then
      raise exception 'FAIL 2: both should be copied, the first with the id asked for (got %)', ids;
    end if;
    select * into a from script_comments where id = '80000000-0000-4000-8000-0000000009f1';
    if a.script_id <> '70000000-0000-4000-8000-0000000009e2' or a.author_id <> '00000000-0000-4000-8000-0000000009e2'
       or a.created_at > now() - interval '2 days' or a.quote <> 'God of War' or a.kind <> 'comment' or a.resolved_at is not null then
      raise exception 'FAIL 2: the copy keeps its words, author and date (got %, %, %)', a.script_id, a.author_id, a.created_at;
    end if;
    select * into b from script_comments where script_id = '70000000-0000-4000-8000-0000000009e2' and kind = 'edit_idea';
    if b.resolved_at is null or b.resolved_by <> '00000000-0000-4000-8000-0000000009e1' or b.author_id <> '00000000-0000-4000-8000-0000000009e2' then
      raise exception 'FAIL 2: a resolved idea stays resolved, by who resolved it';
    end if;
    -- Again: nothing new.
    ids := script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e2', '[]'::jsonb);
    if jsonb_array_length(ids) <> 0 or (select count(*) from script_comments where script_id = '70000000-0000-4000-8000-0000000009e2') <> 2 then
      raise exception 'FAIL 2: copying twice made doubles';
    end if;
    -- After the copy, writing is the writer's again (the copy mode ends with the function).
    insert into script_comments (script_id, quote, occurrence, body, author_id, created_at)
    values ('70000000-0000-4000-8000-0000000009e2', 'running', 0, 'After the copy', '00000000-0000-4000-8000-0000000009e4', '2020-01-01');
    if (select author_id from script_comments where body = 'After the copy') <> '00000000-0000-4000-8000-0000000009e2'
       or (select created_at from script_comments where body = 'After the copy') < now() - interval '1 minute' then
      raise exception 'FAIL 2: a comment written after a copy kept a made-up author or date';
    end if;
  end $$;
commit;

-- 3. A drawing only where the server copied it to: <team>/<to>/<new id>.png, with its size.
alter table script_comments disable trigger script_comments_write;
update script_comments set sketch_path = '10000000-0000-4000-8000-0000000009e1/70000000-0000-4000-8000-0000000009e1/80000000-0000-4000-8000-0000000009e2.png', sketch_w = 800, sketch_h = 600
 where id = '80000000-0000-4000-8000-0000000009e2';
alter table script_comments enable trigger script_comments_write;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  do $$ declare ids jsonb; s record; n int; begin
    ids := script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e3',
      '[{"id": "80000000-0000-4000-8000-0000000009e2", "new_id": "80000000-0000-4000-8000-0000000009f2", "sketch": true}]'::jsonb);
    select * into s from script_comments where id = '80000000-0000-4000-8000-0000000009f2';
    if s.sketch_path <> '10000000-0000-4000-8000-0000000009e1/70000000-0000-4000-8000-0000000009e3/80000000-0000-4000-8000-0000000009f2.png' or s.sketch_w <> 800 or s.sketch_h <> 600 then
      raise exception 'FAIL 3: the copied drawing should be in the new document''s folder (got %)', s.sketch_path;
    end if;
    select count(*) into n from script_comments where script_id = '70000000-0000-4000-8000-0000000009e3' and sketch_path is not null;
    if n <> 1 then
      raise exception 'FAIL 3: only the drawing that was copied is kept (got %)', n;
    end if;
  end $$;
commit;

-- 4. Not across videos or teams, and not by someone who can't comment on the document it goes to.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  do $$ begin
    perform script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e4', '[]'::jsonb);
    raise exception 'FAIL 4: comments went to another video';
  exception when no_data_found then null;
  end $$;
  do $$ begin
    perform script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e1', '[]'::jsonb);
    raise exception 'FAIL 4: a document copied onto itself';
  exception when no_data_found then null;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e4');
  set local role authenticated;
  do $$ begin
    perform script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e3', '[]'::jsonb);
    raise exception 'FAIL 4: another team copied the comments';
  exception when no_data_found then null;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e3');
  set local role authenticated;
  do $$ begin
    perform script_copy_comments('70000000-0000-4000-8000-0000000009e1', '70000000-0000-4000-8000-0000000009e3', '[]'::jsonb);
    raise exception 'FAIL 4: someone who can''t comment on the script copied comments into it';
  exception when insufficient_privilege then null;
  end $$;
rollback;

-- 5. Only people signed in may call it.
do $$ begin
  if has_function_privilege('anon', 'script_copy_comments(uuid, uuid, jsonb)', 'execute') then
    raise exception 'FAIL 5: anon may copy comments';
  end if;
end $$;
