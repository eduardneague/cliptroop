-- Checks for 0132: a script's live channel ("script:<id>", private) is its team's only. Realtime asks the rules with
-- the channel's name in realtime.topic(); here that's set by hand. Run by scripts/db/test-from-scratch.sh; each check
-- raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: S writes in team L1, R is also in L1, O owns team L2 (not in L1).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a5e1', 's-l1@example.com'),
  ('00000000-0000-4000-8000-00000000a5e2', 'r-l1@example.com'),
  ('00000000-0000-4000-8000-00000000a5e3', 'o-l2@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-00000000a5e1', 's-l1@example.com'),
  ('00000000-0000-4000-8000-00000000a5e2', 'r-l1@example.com'),
  ('00000000-0000-4000-8000-00000000a5e3', 'o-l2@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000a5e1', 'Team L1', 'script-live-l1', '00000000-0000-4000-8000-00000000a5e1'),
  ('10000000-0000-4000-8000-00000000a5e2', 'Team L2', 'script-live-l2', '00000000-0000-4000-8000-00000000a5e3')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-00000000a5e1', '10000000-0000-4000-8000-00000000a5e1', '00000000-0000-4000-8000-00000000a5e1', 's-l1@example.com', 'active'),
  ('20000000-0000-4000-8000-00000000a5e2', '10000000-0000-4000-8000-00000000a5e1', '00000000-0000-4000-8000-00000000a5e2', 'r-l1@example.com', 'active'),
  ('20000000-0000-4000-8000-00000000a5e3', '10000000-0000-4000-8000-00000000a5e2', '00000000-0000-4000-8000-00000000a5e3', 'o-l2@example.com', 'active')
on conflict do nothing;

insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-00000000a5e1', '10000000-0000-4000-8000-00000000a5e1', 'Night market tour', 'script', '00000000-0000-4000-8000-00000000a5e1'),
  ('30000000-0000-4000-8000-00000000a5e2', '10000000-0000-4000-8000-00000000a5e2', 'Team L2 video', 'script', '00000000-0000-4000-8000-00000000a5e3');
insert into scripts (id, long_video_id, kind, name, position, step, content_text) values
  ('70000000-0000-4000-8000-00000000a5e1', '30000000-0000-4000-8000-00000000a5e1', 'script', 'Script', 1, 'write', 'Cold open on the grill.'),
  ('70000000-0000-4000-8000-00000000a5e2', '30000000-0000-4000-8000-00000000a5e2', 'script', 'Script', 1, 'write', '');

-- What Realtime would find for each channel (written as itself).
insert into realtime.messages (topic, extension, event) values
  ('script:70000000-0000-4000-8000-00000000a5e1', 'broadcast', 'cursor'),
  ('script:70000000-0000-4000-8000-00000000a5e1', 'presence', 'sync'),
  ('script:70000000-0000-4000-8000-00000000a5e1', 'postgres_changes', 'x'),
  ('script:70000000-0000-4000-8000-00000000a5e2', 'broadcast', 'cursor');

create or replace function pg_temp.as_user(p uuid, topic text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('realtime.topic', topic, true);
$$;

-- 1. A teammate joins L1's script: sees its cursors and who's here (broadcast, presence; nothing else), and may send.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-00000000a5e2', 'script:70000000-0000-4000-8000-00000000a5e1');
  set local role authenticated;
  do $$ declare n int; begin
    select count(*) into n from realtime.messages where topic = realtime.topic();
    if n <> 2 then raise exception 'FAIL 1: a teammate receives the script''s broadcast and presence, only (got % rows)', n; end if;
  end $$;
  insert into realtime.messages (topic, extension, event) values (realtime.topic(), 'broadcast', 'cursor');
  insert into realtime.messages (topic, extension, event) values (realtime.topic(), 'presence', 'track');
rollback;

-- 2. Someone from another team, on L1's script: receives nothing, may not send.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-00000000a5e3', 'script:70000000-0000-4000-8000-00000000a5e1');
  set local role authenticated;
  do $$ declare n int; begin
    select count(*) into n from realtime.messages;
    if n <> 0 then raise exception 'FAIL 2: another team sees nothing of the script (got % rows)', n; end if;
    begin
      insert into realtime.messages (topic, extension, event) values (realtime.topic(), 'broadcast', 'cursor');
      raise exception 'FAIL 2: another team may not send to the script';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 3. The teammate on the other team's script, or on a name that isn't a script's: nothing, and no error.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-00000000a5e1', 'script:70000000-0000-4000-8000-00000000a5e2');
  set local role authenticated;
  do $$ declare n int; begin
    select count(*) into n from realtime.messages;
    if n <> 0 then raise exception 'FAIL 3: not another team''s script (got % rows)', n; end if;
    perform set_config('realtime.topic', 'script:not-a-script', true);
    select count(*) into n from realtime.messages;
    if n <> 0 then raise exception 'FAIL 3: a made-up name gets nothing (got % rows)', n; end if;
    perform set_config('realtime.topic', 'notifications:00000000-0000-4000-8000-00000000a5e1', true);
    begin
      insert into realtime.messages (topic, extension, event) values (realtime.topic(), 'broadcast', 'x');
      raise exception 'FAIL 3: these rules open no other private channel';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 4. Signed out: nothing.
begin;
  select set_config('realtime.topic', 'script:70000000-0000-4000-8000-00000000a5e1', true);
  set local role anon;
  do $$ declare n int; begin
    select count(*) into n from realtime.messages;
    if n <> 0 then raise exception 'FAIL 4: signed out sees nothing (got % rows)', n; end if;
  end $$;
rollback;

-- 5. App setup can tell the rules are there.
do $$ begin
  if not public.script_live_ready() then raise exception 'FAIL 5: script_live_ready() says the rules are missing'; end if;
end $$;

delete from realtime.messages where topic like 'script:%';
