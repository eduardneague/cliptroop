-- Checks for 0127: editing a comment (only its author; "edited" set by the database), general comments (no quote),
-- and quotes over several lines (up to 4,000 characters). Run by scripts/db/test-from-scratch.sh; each check raises
-- on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team E (its owner), S = scripter of video V.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000012c1', 'm-e@example.com'),
  ('00000000-0000-4000-8000-0000000012c2', 's-e@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000012c1', 'm-e@example.com'),
  ('00000000-0000-4000-8000-0000000012c2', 's-e@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000012c1', 'Team E', 'comment-edits-e', '00000000-0000-4000-8000-0000000012c1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000012c2', '10000000-0000-4000-8000-0000000012c1', '00000000-0000-4000-8000-0000000012c2', 's-e@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000012c2', 'scripter')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-0000000012c1', '10000000-0000-4000-8000-0000000012c1', 'Editing comments', 'script', '00000000-0000-4000-8000-0000000012c1')
on conflict do nothing;
insert into long_video_scripters (project_id, team_member_id) values
  ('30000000-0000-4000-8000-0000000012c1', '20000000-0000-4000-8000-0000000012c2')
on conflict do nothing;
insert into scripts (id, long_video_id, kind, name, position, step, content_text) values
  ('70000000-0000-4000-8000-0000000012c1', '30000000-0000-4000-8000-0000000012c1', 'script', 'Script', 1, 'write', 'First line. Second line.')
on conflict do nothing;

-- 1. A general comment (no quote), a quote over two lines, and the longest quote; one past it is refused.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000012c2');
  set local role authenticated;
  insert into script_comments (id, script_id, quote, occurrence, body, kind, edited_at)
  values ('80000000-0000-4000-8000-0000000012c1', '70000000-0000-4000-8000-0000000012c1', '', 0, 'The whole video needs a faster start', 'comment', now() - interval '1 day');
  insert into script_comments (id, script_id, quote, occurrence, body, kind)
  values ('80000000-0000-4000-8000-0000000012c2', '70000000-0000-4000-8000-0000000012c1', E'First line.\nSecond line.', 0, 'Cut between these', 'edit_idea');
  insert into script_comments (id, script_id, quote, occurrence, body)
  values ('80000000-0000-4000-8000-0000000012c3', '70000000-0000-4000-8000-0000000012c1', repeat('x', 4000), 0, 'Long');
  do $$ begin
    if (select edited_at from script_comments where id = '80000000-0000-4000-8000-0000000012c1') is not null then
      raise exception 'FAIL 1: a new comment can''t start as edited';
    end if;
    begin
      insert into script_comments (script_id, quote, occurrence, body) values ('70000000-0000-4000-8000-0000000012c1', repeat('x', 4001), 0, 'Too long');
      raise exception 'FAIL 1: a quote over 4,000 characters was let in';
    exception when check_violation then null;
    end;
  end $$;
commit;

-- 2. Its author changes the words: edited, now. Setting "edited" by hand does nothing.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000012c2');
  set local role authenticated;
  update script_comments set body = 'The whole video needs a much faster start' where id = '80000000-0000-4000-8000-0000000012c1';
  do $$ declare e timestamptz; begin
    select edited_at into e from script_comments where id = '80000000-0000-4000-8000-0000000012c1';
    if e is null or e < now() - interval '1 minute' then
      raise exception 'FAIL 2: changing the words marks it edited, now (got %)', e;
    end if;
  end $$;
  update script_comments set edited_at = null where id = '80000000-0000-4000-8000-0000000012c2';
  update script_comments set edited_at = now() where id = '80000000-0000-4000-8000-0000000012c3';
  do $$ begin
    if (select edited_at from script_comments where id = '80000000-0000-4000-8000-0000000012c3') is not null then
      raise exception 'FAIL 2: "edited" was set by hand';
    end if;
  end $$;
commit;

-- 3. Someone else (the master) can resolve it, which doesn't make it edited, but can't change its words or its place.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000012c1');
  set local role authenticated;
  update script_comments set resolved_at = now() where id = '80000000-0000-4000-8000-0000000012c2';
  do $$ begin
    if (select edited_at from script_comments where id = '80000000-0000-4000-8000-0000000012c2') is not null then
      raise exception 'FAIL 3: resolving made it edited';
    end if;
    begin
      update script_comments set body = 'Changed by the master' where id = '80000000-0000-4000-8000-0000000012c1';
      raise exception 'FAIL 3: the master changed someone else''s words';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000012c2');
  set local role authenticated;
  do $$ begin
    begin
      update script_comments set quote = 'Second line.' where id = '80000000-0000-4000-8000-0000000012c1';
      raise exception 'FAIL 3: a general comment was moved onto words';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

select 'script-comment-edits: ok';
