-- Checks for 0134 (writing a script together, live): steps are taken in one order (a page sending on an old version
-- is told the script moved on), only by people who may edit the script; the steps since a version come back in order
-- (or "gone" when they start before what's kept); the saved text only moves forward; replacing the text another way
-- starts the live writing again; nobody outside the team reads or writes any of it, and nobody writes the tables
-- straight. Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team L, S = scripter of video V on L, R = researcher on L (can't edit the script), O = owner of team K.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000013401', 'm-l@example.com'),
  ('00000000-0000-4000-8000-000000013402', 's-l@example.com'),
  ('00000000-0000-4000-8000-000000013403', 'r-l@example.com'),
  ('00000000-0000-4000-8000-000000013404', 'o-k@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000013401', 'm-l@example.com'),
  ('00000000-0000-4000-8000-000000013402', 's-l@example.com'),
  ('00000000-0000-4000-8000-000000013403', 'r-l@example.com'),
  ('00000000-0000-4000-8000-000000013404', 'o-k@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000013401', 'Team L', 'live-edits-l', '00000000-0000-4000-8000-000000013401'),
  ('10000000-0000-4000-8000-000000013402', 'Team K', 'live-edits-k', '00000000-0000-4000-8000-000000013404')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-000000013402', '10000000-0000-4000-8000-000000013401', '00000000-0000-4000-8000-000000013402', 's-l@example.com', 'active'),
  ('20000000-0000-4000-8000-000000013403', '10000000-0000-4000-8000-000000013401', '00000000-0000-4000-8000-000000013403', 'r-l@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-000000013402', 'scripter'),
  ('20000000-0000-4000-8000-000000013403', 'researcher')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-000000013401', '10000000-0000-4000-8000-000000013401', 'Live', 'script', '00000000-0000-4000-8000-000000013401')
on conflict do nothing;
insert into long_video_scripters (project_id, team_member_id) values
  ('30000000-0000-4000-8000-000000013401', '20000000-0000-4000-8000-000000013402')
on conflict do nothing;
insert into scripts (id, long_video_id, kind, name, position, step, content, content_text) values
  ('70000000-0000-4000-8000-000000013401', '30000000-0000-4000-8000-000000013401', 'script', 'Script', 1, 'write',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}', 'Hello'),
  ('70000000-0000-4000-8000-000000013402', '30000000-0000-4000-8000-000000013401', 'script', 'Review', 2, 'review', '{"type":"doc","content":[]}', '')
on conflict do nothing;

-- 1. S sends two steps on version 0, then one on 2: versions 2 and 3, in order, by S.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013402');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := script_live_push('70000000-0000-4000-8000-000000013401', 0, '[{"stepType":"replace","from":6,"to":6,"slice":{"content":[{"type":"text","text":" there"}]}},{"stepType":"replace","from":12,"to":12,"slice":{"content":[{"type":"text","text":"!"}]}}]', 'page-s-1');
    if r <> '{"ok": true, "version": 2}'::jsonb then raise exception 'FAIL 1: first push (got %)', r; end if;
    r := script_live_push('70000000-0000-4000-8000-000000013401', 2, '[{"stepType":"replace","from":1,"to":1,"slice":{"content":[{"type":"text","text":">"}]}}]', 'page-s-1');
    if r <> '{"ok": true, "version": 3}'::jsonb then raise exception 'FAIL 1: second push (got %)', r; end if;
  end $$;
commit;

-- 2. M (another page) sends on version 2: told the script is at 3, nothing taken. Then the steps since 2: the one at 2.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013401');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := script_live_push('70000000-0000-4000-8000-000000013401', 2, '[{"stepType":"replace","from":1,"to":1,"slice":{"content":[{"type":"text","text":"#"}]}}]', 'page-m-1');
    if r <> '{"ok": false, "version": 3}'::jsonb then raise exception 'FAIL 2: an old version is turned down (got %)', r; end if;
    r := script_live_since('70000000-0000-4000-8000-000000013401', 2);
    if (r->>'version')::int <> 3 or jsonb_array_length(r->'steps') <> 1 or (r->'steps'->0->>'v')::int <> 2 or r->'steps'->0->>'c' <> 'page-s-1' then
      raise exception 'FAIL 2: the steps since 2 (got %)', r;
    end if;
    r := script_live_since('70000000-0000-4000-8000-000000013401', 0);
    if jsonb_array_length(r->'steps') <> 2 or (r->'steps'->1->>'v')::int <> 2 then raise exception 'FAIL 2: all of them, in order (got %)', r; end if;
    r := script_live_since('70000000-0000-4000-8000-000000013401', 1);
    if coalesce((r->>'gone')::boolean, false) is not true then raise exception 'FAIL 2: in the middle of a batch: gone (got %)', r; end if;
    if (select count(*) from script_steps where script_id = '70000000-0000-4000-8000-000000013401') <> 2 then
      raise exception 'FAIL 2: the team reads the steps';
    end if;
  end $$;
commit;

-- 3. R (a researcher: may read the script, not edit it) and O (another team) can't send; O can't read either.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013403');
  set local role authenticated;
  do $$ begin
    begin
      perform script_live_push('70000000-0000-4000-8000-000000013401', 3, '[{"stepType":"replace","from":1,"to":1}]', 'page-r-1');
      raise exception 'FAIL 3: a researcher sent steps to the script';
    exception when insufficient_privilege then null;
    end;
    perform script_live_since('70000000-0000-4000-8000-000000013401', 0);
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013404');
  set local role authenticated;
  do $$ begin
    begin
      perform script_live_push('70000000-0000-4000-8000-000000013401', 3, '[{"stepType":"replace","from":1,"to":1}]', 'page-o-1');
      raise exception 'FAIL 3: another team sent steps';
    exception when insufficient_privilege then null;
    end;
    begin
      perform script_live_since('70000000-0000-4000-8000-000000013401', 0);
      raise exception 'FAIL 3: another team read the steps';
    exception when insufficient_privilege then null;
    end;
    if exists (select 1 from script_steps) or exists (select 1 from script_live) then
      raise exception 'FAIL 3: another team sees the tables';
    end if;
  end $$;
commit;

-- 4. Nobody writes the tables straight (the functions are the way in), and bad input is turned down.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013402');
  set local role authenticated;
  do $$ begin
    begin
      insert into script_steps (script_id, version, n, steps, client, team_id)
      values ('70000000-0000-4000-8000-000000013401', 3, 1, '[]', 'page-s-1', '10000000-0000-4000-8000-000000013401');
      raise exception 'FAIL 4: steps written straight';
    exception when insufficient_privilege then null;
    end;
    begin
      update script_live set version = 99 where script_id = '70000000-0000-4000-8000-000000013401';
      raise exception 'FAIL 4: the version changed straight';
    exception when insufficient_privilege then null;
    end;
    begin
      perform script_live_push('70000000-0000-4000-8000-000000013401', 3, '{"not":"a list"}', 'page-s-1');
      raise exception 'FAIL 4: not a list of steps';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform script_live_push('70000000-0000-4000-8000-000000013401', 3, '[{}]', 'bad id!');
      raise exception 'FAIL 4: a bad page id';
    exception when invalid_parameter_value then null;
    end;
  end $$;
commit;

-- 5. The saved text: only forward, only up to the version; a late older one is left out; the version doesn't jump.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013402');
  set local role authenticated;
  do $$ declare r jsonb; v_version int; begin
    select version into v_version from scripts where id = '70000000-0000-4000-8000-000000013401';
    r := script_live_snapshot('70000000-0000-4000-8000-000000013401', 3, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":">Hello there!"}]}]}', '>Hello there!', 2);
    if r <> '{"ok": true}'::jsonb then raise exception 'FAIL 5: the saved text at 3 (got %)', r; end if;
    if (select content_text from scripts where id = '70000000-0000-4000-8000-000000013401') <> '>Hello there!'
       or (select doc_version from script_live where script_id = '70000000-0000-4000-8000-000000013401') <> 3
       or (select version from script_live where script_id = '70000000-0000-4000-8000-000000013401') <> 3 then
      raise exception 'FAIL 5: saved, at 3, and the steps kept going from 3';
    end if;
    if (select version from scripts where id = '70000000-0000-4000-8000-000000013401') <> v_version + 1 then
      raise exception 'FAIL 5: the script''s own version moves with a save';
    end if;
    r := script_live_snapshot('70000000-0000-4000-8000-000000013401', 2, '{"type":"doc","content":[]}', '', 0);
    if r <> '{"ok": false}'::jsonb or (select content_text from scripts where id = '70000000-0000-4000-8000-000000013401') <> '>Hello there!' then
      raise exception 'FAIL 5: an older one is left out (got %)', r;
    end if;
    r := script_live_snapshot('70000000-0000-4000-8000-000000013401', 9, '{"type":"doc","content":[]}', '', 0);
    if r <> '{"ok": false}'::jsonb then raise exception 'FAIL 5: not past the steps there are (got %)', r; end if;
  end $$;
commit;

-- 6. The text replaced another way (an older page saving it whole, or sent on): the live writing starts again from it;
--    a page still on the old steps is told they're gone.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013402');
  set local role authenticated;
  update scripts set content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Other"}]}]}', content_text = 'Other'
   where id = '70000000-0000-4000-8000-000000013401';
  do $$ declare r jsonb; begin
    if (select version from script_live where script_id = '70000000-0000-4000-8000-000000013401') <> 4
       or (select doc_version from script_live where script_id = '70000000-0000-4000-8000-000000013401') <> 4
       or exists (select 1 from script_steps where script_id = '70000000-0000-4000-8000-000000013401') then
      raise exception 'FAIL 6: started again at 4, the old steps gone';
    end if;
    r := script_live_since('70000000-0000-4000-8000-000000013401', 3);
    if coalesce((r->>'gone')::boolean, false) is not true then raise exception 'FAIL 6: a page on 3 is told (got %)', r; end if;
    r := script_live_push('70000000-0000-4000-8000-000000013401', 4, '[{"stepType":"replace","from":1,"to":1,"slice":{"content":[{"type":"text","text":"x"}]}}]', 'page-s-2');
    if r <> '{"ok": true, "version": 5}'::jsonb then raise exception 'FAIL 6: and goes on from there (got %)', r; end if;
  end $$;
commit;

-- 7. A script nobody has written in live yet: version 0, no steps. Its text replaced the old way: version 1, so a page
--    that opened the old text (version 0) can't put its steps on the new one.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000013401');
  set local role authenticated;
  do $$ declare r jsonb; begin
    r := script_live_since('70000000-0000-4000-8000-000000013402', 0);
    if r <> '{"doc": 0, "steps": [], "version": 0}'::jsonb then raise exception 'FAIL 7: a new one (got %)', r; end if;
  end $$;
  update scripts set content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Copied in"}]}]}' where id = '70000000-0000-4000-8000-000000013402';
  do $$ declare r jsonb; begin
    r := script_live_push('70000000-0000-4000-8000-000000013402', 0, '[{"stepType":"replace","from":1,"to":1}]', 'page-m-2');
    if r <> '{"ok": false, "version": 1}'::jsonb then raise exception 'FAIL 7: a page on the old text is turned down (got %)', r; end if;
    r := script_live_since('70000000-0000-4000-8000-000000013402', 0);
    if coalesce((r->>'gone')::boolean, false) is not true or (r->>'doc')::int <> 1 then raise exception 'FAIL 7: and told to draw the new text (got %)', r; end if;
  end $$;
commit;

-- 8. A deleted script takes its live writing with it.
delete from scripts where id = '70000000-0000-4000-8000-000000013401';
do $$ begin
  if exists (select 1 from script_live where script_id = '70000000-0000-4000-8000-000000013401')
     or exists (select 1 from script_steps where script_id = '70000000-0000-4000-8000-000000013401') then
    raise exception 'FAIL 8: a deleted script''s live writing is gone too';
  end if;
end $$;

-- Tidy up.
delete from long_video_projects where id = '30000000-0000-4000-8000-000000013401';
delete from teams where id in ('10000000-0000-4000-8000-000000013401', '10000000-0000-4000-8000-000000013402');
delete from auth.users where id in ('00000000-0000-4000-8000-000000013401', '00000000-0000-4000-8000-000000013402', '00000000-0000-4000-8000-000000013403', '00000000-0000-4000-8000-000000013404');

select 'script live edits: all passed' as result;
