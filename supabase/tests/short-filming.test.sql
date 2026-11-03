-- Checks for 0112/0113: a Filming step for shorts (Script → Filming → Editing). The master sends it to filming; its
-- filmer (with nobody set, any filmer; or a master) marks it filmed with where the footage is, and it moves to Editing;
-- nobody else can, and nobody can fake when it was filmed; the filmer gets a task and the editor's comes next; who films
-- it is the master's or a scheduler's to change, and must be on the team; filming counts for XP as filming. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). F: the filmer on short A. G: another filmer. E: editor. O: on the team, no filming role.
-- P: a scheduler. X: master of another team (and its member Y).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000113a1', 'm113@example.com'),
  ('00000000-0000-4000-8000-0000000113a2', 'f113@example.com'),
  ('00000000-0000-4000-8000-0000000113a3', 'g113@example.com'),
  ('00000000-0000-4000-8000-0000000113a4', 'e113@example.com'),
  ('00000000-0000-4000-8000-0000000113a5', 'o113@example.com'),
  ('00000000-0000-4000-8000-0000000113a6', 'p113@example.com'),
  ('00000000-0000-4000-8000-0000000113b1', 'x113@example.com'),
  ('00000000-0000-4000-8000-0000000113b2', 'y113@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%113@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000113a0', 'Team 113', 'team-113', '00000000-0000-4000-8000-0000000113a1'),
  ('10000000-0000-4000-8000-0000000113b0', 'Other 113', 'other-113', '00000000-0000-4000-8000-0000000113b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000113a2', '10000000-0000-4000-8000-0000000113a0', '00000000-0000-4000-8000-0000000113a2', 'f113@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000113a3', '10000000-0000-4000-8000-0000000113a0', '00000000-0000-4000-8000-0000000113a3', 'g113@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000113a4', '10000000-0000-4000-8000-0000000113a0', '00000000-0000-4000-8000-0000000113a4', 'e113@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000113a5', '10000000-0000-4000-8000-0000000113a0', '00000000-0000-4000-8000-0000000113a5', 'o113@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000113a6', '10000000-0000-4000-8000-0000000113a0', '00000000-0000-4000-8000-0000000113a6', 'p113@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000113b2', '10000000-0000-4000-8000-0000000113b0', '00000000-0000-4000-8000-0000000113b2', 'y113@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000113a2', 'filmer'),
  ('30000000-0000-4000-8000-0000000113a3', 'filmer'),
  ('30000000-0000-4000-8000-0000000113a4', 'editor'),
  ('30000000-0000-4000-8000-0000000113a5', 'researcher'),
  ('30000000-0000-4000-8000-0000000113a6', 'publisher')
on conflict do nothing;

-- A: at Script, F films it, E edits it. B: at Filming, nobody set to film it. C: at Script, for the scheduler checks.
insert into short_videos (id, team_id, title, stage, planned_date, schedule_mode, platforms, filmer_member_id, editor_member_id, created_by) values
  ('50000000-0000-4000-8000-0000000113a1', '10000000-0000-4000-8000-0000000113a0', 'Short A', 'script', current_date + 9, 'pinned', '{youtube}', '30000000-0000-4000-8000-0000000113a2', '30000000-0000-4000-8000-0000000113a4', '00000000-0000-4000-8000-0000000113a1'),
  ('50000000-0000-4000-8000-0000000113a2', '10000000-0000-4000-8000-0000000113a0', 'Short B', 'filming', current_date + 10, 'pinned', '{youtube}', null, '30000000-0000-4000-8000-0000000113a4', '00000000-0000-4000-8000-0000000113a1'),
  ('50000000-0000-4000-8000-0000000113a3', '10000000-0000-4000-8000-0000000113a0', 'Short C', 'script', current_date + 11, 'pinned', '{youtube}', null, null, '00000000-0000-4000-8000-0000000113a1');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
create or replace function pg_temp.task_state(p_short uuid, p_stage text, p_user uuid) returns text language sql as $$
  select string_agg(state, ',' order by created_at) from tasks where kind = 'short' and item_id = p_short and stage = p_stage and user_id = p_user;
$$;

-- 1. The enum has the step in the right place, and A's tasks: F's filming waits, E's editing waits.
do $$ begin
  if (select array_agg(e.enumlabel order by e.enumsortorder)::text from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'short_stage') is distinct from '{script,filming,editing,review,ready,posted}' then
    raise exception 'FAIL 1: short_stage should be script, filming, editing, review, ready, posted';
  end if;
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a1', 'filming', '00000000-0000-4000-8000-0000000113a2') is distinct from 'waiting' then
    raise exception 'FAIL 1: the filmer''s task should be waiting, is %', pg_temp.task_state('50000000-0000-4000-8000-0000000113a1', 'filming', '00000000-0000-4000-8000-0000000113a2');
  end if;
end $$;

-- 2. F can't send A to filming (that's the master's); the master can. F's task is active then.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a2');
  set local role authenticated;
  do $$ begin
    begin
      update short_videos set stage = 'filming' where id = '50000000-0000-4000-8000-0000000113a1';
      raise exception 'FAIL 2: the filmer sent it to filming';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a1');
  set local role authenticated;
  update short_videos set stage = 'filming' where id = '50000000-0000-4000-8000-0000000113a1';
commit;
do $$ begin
  if (select stage::text from short_videos where id = '50000000-0000-4000-8000-0000000113a1') is distinct from 'filming' then raise exception 'FAIL 2: the master sends it to filming'; end if;
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a1', 'filming', '00000000-0000-4000-8000-0000000113a2') is distinct from 'active' then raise exception 'FAIL 2: at Filming the filmer''s task is active'; end if;
end $$;

-- 3. Only its filmer (or a master) marks it filmed: not O, not G (a filmer, but not this one's), not by moving the stage itself.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a5');
  set local role authenticated;
  do $$ begin
    begin
      perform short_mark_filmed('50000000-0000-4000-8000-0000000113a1', '/raw/a');
      raise exception 'FAIL 3: someone without the role marked it filmed';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a3');
  set local role authenticated;
  do $$ begin
    begin
      perform short_mark_filmed('50000000-0000-4000-8000-0000000113a1', '/raw/a');
      raise exception 'FAIL 3: another filmer marked it filmed';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a2');
  set local role authenticated;
  do $$ begin
    begin
      update short_videos set stage = 'editing' where id = '50000000-0000-4000-8000-0000000113a1';
      raise exception 'FAIL 3: the filmer moved the stage by hand';
    exception when insufficient_privilege then null;
    end;
    begin
      update short_videos set filmed_at = now() where id = '50000000-0000-4000-8000-0000000113a1';
      raise exception 'FAIL 3: the filmer wrote filmed_at by hand';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 4. F marks it filmed, with the folder: at Editing, when, by whom and where; F's task done, E's active.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a2');
  set local role authenticated;
  select short_mark_filmed('50000000-0000-4000-8000-0000000113a1', '  /volume1/raw/short-a  ');
commit;
do $$
declare s record;
begin
  select stage::text as stage, filmed_at, filmed_by, footage_path into s from short_videos where id = '50000000-0000-4000-8000-0000000113a1';
  if s.stage is distinct from 'editing' or s.filmed_at is null or s.filmed_by is distinct from '00000000-0000-4000-8000-0000000113a2' or s.footage_path is distinct from '/volume1/raw/short-a' then
    raise exception 'FAIL 4: filmed: %', s;
  end if;
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a1', 'filming', '00000000-0000-4000-8000-0000000113a2') is distinct from 'done' then raise exception 'FAIL 4: the filmer''s task is done'; end if;
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a1', 'editing', '00000000-0000-4000-8000-0000000113a4') is distinct from 'active' then raise exception 'FAIL 4: the editor''s task is active'; end if;
  if not exists (select 1 from short_video_events where short_id = '50000000-0000-4000-8000-0000000113a1' and kind = 'stage' and from_stage = 'filming' and to_stage = 'editing' and actor_id = '00000000-0000-4000-8000-0000000113a2') then
    raise exception 'FAIL 4: its history says who moved it from Filming to Editing';
  end if;
end $$;

-- 5. Not twice: it's not at Filming any more.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a2');
  set local role authenticated;
  do $$ begin
    begin
      perform short_mark_filmed('50000000-0000-4000-8000-0000000113a1', null);
      raise exception 'FAIL 5: marked filmed twice';
    exception when check_violation then null;
    end;
  end $$;
rollback;

-- 6. B, nobody set to film it: any filmer can (G), with no folder (the one it had stays); O can't.
update short_videos set footage_path = '/volume1/raw/short-b' where id = '50000000-0000-4000-8000-0000000113a2';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a5');
  set local role authenticated;
  do $$ begin
    begin
      perform short_mark_filmed('50000000-0000-4000-8000-0000000113a2', null);
      raise exception 'FAIL 6: someone without the role marked B filmed';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a3');
  set local role authenticated;
  select short_mark_filmed('50000000-0000-4000-8000-0000000113a2', '   ');
commit;
do $$ begin
  if (select stage::text from short_videos where id = '50000000-0000-4000-8000-0000000113a2') is distinct from 'editing'
     or (select footage_path from short_videos where id = '50000000-0000-4000-8000-0000000113a2') is distinct from '/volume1/raw/short-b'
     or (select filmed_by from short_videos where id = '50000000-0000-4000-8000-0000000113a2') is distinct from '00000000-0000-4000-8000-0000000113a3' then
    raise exception 'FAIL 6: any filmer marks B filmed (no folder given: the one it had stays)';
  end if;
end $$;

-- 7. Who films it: O can't change it; the scheduler P can; it must be someone on the team.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a5');
  set local role authenticated;
  do $$ begin
    begin
      update short_videos set filmer_member_id = '30000000-0000-4000-8000-0000000113a5' where id = '50000000-0000-4000-8000-0000000113a3';
      raise exception 'FAIL 7: someone without the right chose the filmer';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a6');
  set local role authenticated;
  update short_videos set filmer_member_id = '30000000-0000-4000-8000-0000000113a3' where id = '50000000-0000-4000-8000-0000000113a3';
  do $$ begin
    begin
      update short_videos set filmer_member_id = '30000000-0000-4000-8000-0000000113b2' where id = '50000000-0000-4000-8000-0000000113a3';
      raise exception 'FAIL 7: a filmer from another team';
    exception when check_violation then null;
    end;
  end $$;
commit;
do $$ begin
  if (select filmer_member_id from short_videos where id = '50000000-0000-4000-8000-0000000113a3') is distinct from '30000000-0000-4000-8000-0000000113a3' then raise exception 'FAIL 7: the scheduler sets the filmer'; end if;
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a3', 'filming', '00000000-0000-4000-8000-0000000113a3') is distinct from 'waiting' then raise exception 'FAIL 7: the new filmer gets a (waiting) task'; end if;
end $$;

-- 8. The footage folder: the filmer or the editor can fix it; O can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a4');
  set local role authenticated;
  update short_videos set footage_path = '/volume1/raw/short-a-v2' where id = '50000000-0000-4000-8000-0000000113a1';
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000113a5');
  set local role authenticated;
  do $$ begin
    begin
      update short_videos set footage_path = '/elsewhere' where id = '50000000-0000-4000-8000-0000000113a1';
      raise exception 'FAIL 8: someone else moved the footage folder';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
do $$ begin
  if (select footage_path from short_videos where id = '50000000-0000-4000-8000-0000000113a1') is distinct from '/volume1/raw/short-a-v2' then raise exception 'FAIL 8: the editor fixes the folder'; end if;
end $$;

-- 9. The team's default filmer must be on the team.
do $$ begin
  begin
    update teams set default_short_filmer_member_id = '30000000-0000-4000-8000-0000000113b2' where id = '10000000-0000-4000-8000-0000000113a0';
    raise exception 'FAIL 9: a default filmer from another team';
  exception when check_violation then null;
  end;
  update teams set default_short_filmer_member_id = '30000000-0000-4000-8000-0000000113a2' where id = '10000000-0000-4000-8000-0000000113a0';
end $$;

-- 10. XP and achievements: filming a short counts as filming, 30 XP; the rest as before.
do $$ begin
  if vp_task_cat('short', 'filming') is distinct from 'film' or vp_task_xp('short', 'filming') is distinct from 30 then raise exception 'FAIL 10: a short''s filming: film, 30'; end if;
  if vp_task_cat('long', 'film') is distinct from 'film' or vp_task_xp('long', 'film') is distinct from 70 or vp_task_xp('short', 'editing') is distinct from 40 or vp_task_cat('short', 'editing') is distinct from 'edit' then
    raise exception 'FAIL 10: the other steps changed';
  end if;
end $$;

-- 11. The Ready to post task still closes once everything is scheduled (0111 kept).
update short_videos set stage = 'ready', scheduler_member_id = '30000000-0000-4000-8000-0000000113a6' where id = '50000000-0000-4000-8000-0000000113a2';
insert into social_posts (team_id, short_id, platform, scheduled_at) values ('10000000-0000-4000-8000-0000000113a0', '50000000-0000-4000-8000-0000000113a2', 'youtube', now() + interval '10 days');
do $$ begin
  if pg_temp.task_state('50000000-0000-4000-8000-0000000113a2', 'ready', '00000000-0000-4000-8000-0000000113a6') is distinct from 'done' then raise exception 'FAIL 11: scheduled: done (0111)'; end if;
end $$;
