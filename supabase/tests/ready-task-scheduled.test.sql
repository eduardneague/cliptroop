-- Checks for 0111: a short's Ready to post task ("Schedule the posts") is done as soon as every platform it goes to
-- has its post set up (scheduled, on its way or out, or marked posted by hand), not when the last post goes out; it
-- comes back (the same task) if one is cancelled or fails while the short is still at Ready to post; and nothing adds
-- a second one. Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- S schedules team T's shorts.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000111a1', 'owner111@example.com'),
  ('00000000-0000-4000-8000-0000000111a2', 'sched111@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000111a1', 'owner111@example.com'),
  ('00000000-0000-4000-8000-0000000111a2', 'sched111@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-0000000111a0', 'Team 111', 'team-111', '00000000-0000-4000-8000-0000000111a1') on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000111a2', '10000000-0000-4000-8000-0000000111a0', '00000000-0000-4000-8000-0000000111a2', 'sched111@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values ('30000000-0000-4000-8000-0000000111a2', 'publisher') on conflict do nothing;

-- X: at Ready to post, five days out, for YouTube and Instagram. Y: for YouTube and TikTok. Z: still at Editing.
insert into short_videos (id, team_id, title, stage, planned_date, schedule_mode, platforms, scheduler_member_id, created_by) values
  ('50000000-0000-4000-8000-0000000111a1', '10000000-0000-4000-8000-0000000111a0', 'Short X', 'ready', current_date + 5, 'pinned', '{youtube,instagram}', '30000000-0000-4000-8000-0000000111a2', '00000000-0000-4000-8000-0000000111a1'),
  ('50000000-0000-4000-8000-0000000111a2', '10000000-0000-4000-8000-0000000111a0', 'Short Y', 'ready', current_date + 6, 'pinned', '{youtube,tiktok}', '30000000-0000-4000-8000-0000000111a2', '00000000-0000-4000-8000-0000000111a1'),
  ('50000000-0000-4000-8000-0000000111a3', '10000000-0000-4000-8000-0000000111a0', 'Short Z', 'editing', current_date + 7, 'pinned', '{youtube}', '30000000-0000-4000-8000-0000000111a2', '00000000-0000-4000-8000-0000000111a1');

create or replace function pg_temp.ready_tasks(p_short uuid) returns table (id uuid, state text, completed_at timestamptz, done_by_schedule boolean, due_date date) language sql as $$
  select t.id, t.state, t.completed_at, t.done_by_schedule, t.due_date from tasks t
   where t.kind = 'short' and t.item_id = p_short and t.stage = 'ready' and t.user_id = '00000000-0000-4000-8000-0000000111a2'
   order by t.created_at;
$$;
create temp table first_task (id uuid);

do $$
declare n int; s text;
begin
  -- 1. At Ready to post, nothing scheduled: S's task is open.
  select count(*), min(state) into n, s from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1');
  if n <> 1 or s is distinct from 'active' then raise exception 'FAIL 1: one open Ready to post task expected, got % (%)', n, s; end if;
  insert into first_task select id from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1');
  if short_ready_scheduled('50000000-0000-4000-8000-0000000111a1') then raise exception 'FAIL 1: nothing is scheduled yet'; end if;
end $$;

-- 2. YouTube scheduled: Instagram isn't yet, still open.
insert into social_posts (team_id, short_id, platform, scheduled_at) values
  ('10000000-0000-4000-8000-0000000111a0', '50000000-0000-4000-8000-0000000111a1', 'youtube', now() + interval '5 days');
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from 'active' then raise exception 'FAIL 2: one platform of two scheduled: still open'; end if;
end $$;

-- 3. Instagram scheduled too: done now, five days before its date, the same task.
insert into social_posts (team_id, short_id, platform, scheduled_at) values
  ('10000000-0000-4000-8000-0000000111a0', '50000000-0000-4000-8000-0000000111a1', 'instagram', now() + interval '5 days');
do $$
declare r record;
begin
  if (select count(*) from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) <> 1 then raise exception 'FAIL 3: a second task appeared'; end if;
  select * into r from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1');
  if r.state is distinct from 'done' or r.completed_at is null or not r.done_by_schedule then raise exception 'FAIL 3: every platform scheduled: done (got %, %, %)', r.state, r.completed_at, r.done_by_schedule; end if;
  if r.id is distinct from (select id from first_task) then raise exception 'FAIL 3: not the same task'; end if;
  if r.due_date is distinct from current_date + 5 then raise exception 'FAIL 3: its date should stay (for "done early"): %', r.due_date; end if;
  if (select stage::text from short_videos where id = '50000000-0000-4000-8000-0000000111a1') is distinct from 'ready' then raise exception 'FAIL 3: the short stays at Ready to post'; end if;
end $$;

-- 4. A change to the short that re-syncs its tasks (its date) adds no new task.
update short_videos set planned_date = current_date + 4 where id = '50000000-0000-4000-8000-0000000111a1';
do $$ begin
  if (select count(*) from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) <> 1 or (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from 'done' then
    raise exception 'FAIL 4: a re-sync should leave the one done task';
  end if;
end $$;

-- 5. Instagram's post cancelled: the same task is open again.
update social_posts set status = 'cancelled' where short_id = '50000000-0000-4000-8000-0000000111a1' and platform = 'instagram';
do $$
declare r record;
begin
  if (select count(*) from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) <> 1 then raise exception 'FAIL 5: reopening should not add a task'; end if;
  select * into r from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1');
  if r.state is distinct from 'active' or r.completed_at is not null or r.done_by_schedule or r.id is distinct from (select id from first_task) then raise exception 'FAIL 5: cancelled: the same task open again (got %, %, %)', r.state, r.completed_at, r.done_by_schedule; end if;
  if r.due_date is distinct from current_date + 4 then raise exception 'FAIL 5: open again, it takes the new date: %', r.due_date; end if;
end $$;

-- 6. Scheduled again: done again. Then it fails when posting: open again; retried: done.
insert into social_posts (team_id, short_id, platform, scheduled_at) values
  ('10000000-0000-4000-8000-0000000111a0', '50000000-0000-4000-8000-0000000111a1', 'instagram', now() + interval '4 days');
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from 'done' then raise exception 'FAIL 6: scheduled again: done'; end if;
end $$;
update social_posts set status = 'failed' where short_id = '50000000-0000-4000-8000-0000000111a1' and platform = 'instagram' and status <> 'cancelled';
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from 'active' then raise exception 'FAIL 6: failed: open again'; end if;
end $$;
update social_posts set status = 'scheduled' where short_id = '50000000-0000-4000-8000-0000000111a1' and platform = 'instagram' and status = 'failed';
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from 'done' then raise exception 'FAIL 6: retried: done'; end if;
end $$;

-- 7. A post's progress (no change of status) doesn't touch the task.
create temp table done_at as select completed_at from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1');
update social_posts set progress = 40, step = 'upload' where short_id = '50000000-0000-4000-8000-0000000111a1' and platform = 'youtube';
do $$ begin
  if (select completed_at from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from (select completed_at from done_at) then raise exception 'FAIL 7: progress moved the task'; end if;
end $$;

-- 8. The posts go out (marked posted): the short is Posted, the task keeps the day it was scheduled.
update social_posts set status = 'published', published_at = now() where short_id = '50000000-0000-4000-8000-0000000111a1' and status = 'scheduled';
insert into short_video_posts (short_id, platform) values
  ('50000000-0000-4000-8000-0000000111a1', 'youtube'),
  ('50000000-0000-4000-8000-0000000111a1', 'instagram');
do $$ begin
  if (select stage::text from short_videos where id = '50000000-0000-4000-8000-0000000111a1') is distinct from 'posted' then raise exception 'FAIL 8: both posted: the short is Posted'; end if;
  if (select count(*) from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) <> 1 then raise exception 'FAIL 8: still one task'; end if;
  if (select completed_at from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a1')) is distinct from (select completed_at from done_at) then raise exception 'FAIL 8: done when scheduled, not when posted'; end if;
end $$;

-- 9. Y: YouTube scheduled, TikTok not: open. TikTok taken off the short: done.
insert into social_posts (team_id, short_id, platform, scheduled_at) values
  ('10000000-0000-4000-8000-0000000111a0', '50000000-0000-4000-8000-0000000111a2', 'youtube', now() + interval '6 days');
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a2')) is distinct from 'active' then raise exception 'FAIL 9: TikTok not scheduled: open'; end if;
end $$;
update short_videos set platforms = '{youtube}' where id = '50000000-0000-4000-8000-0000000111a2';
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a2')) is distinct from 'done' then raise exception 'FAIL 9: its platforms changed, all scheduled: done'; end if;
end $$;
-- TikTok back on the short: open again.
update short_videos set platforms = '{youtube,tiktok}' where id = '50000000-0000-4000-8000-0000000111a2';
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a2')) is distinct from 'active' then raise exception 'FAIL 9: a platform added: open again'; end if;
end $$;
-- TikTok marked posted by hand (no scheduled post): set up, done.
insert into short_video_posts (short_id, platform) values ('50000000-0000-4000-8000-0000000111a2', 'tiktok');
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a2')) is distinct from 'done' then raise exception 'FAIL 9: marked posted by hand counts'; end if;
  if (select count(*) from tasks where kind = 'short' and item_id = '50000000-0000-4000-8000-0000000111a2' and stage = 'ready' and state <> 'done') <> 0 then raise exception 'FAIL 9: an open task is left'; end if;
end $$;

-- 10. Z, still at Editing with a post scheduled for its only platform: its Ready to post task waits.
insert into social_posts (team_id, short_id, platform, scheduled_at) values
  ('10000000-0000-4000-8000-0000000111a0', '50000000-0000-4000-8000-0000000111a3', 'youtube', now() + interval '7 days');
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a3')) is distinct from 'waiting' then
    raise exception 'FAIL 10: not at Ready to post yet: waiting (got %)', (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a3'));
  end if;
end $$;
-- Its date moves: the waiting task follows (it's still kept in step like any other).
update short_videos set planned_date = current_date + 8 where id = '50000000-0000-4000-8000-0000000111a3';
do $$ begin
  if (select due_date from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a3')) is distinct from current_date + 8 then
    raise exception 'FAIL 10: the waiting task should follow the new date';
  end if;
end $$;
-- At Ready to post with its post scheduled already: done as it gets there.
update short_videos set stage = 'ready' where id = '50000000-0000-4000-8000-0000000111a3';
do $$ begin
  if (select state from pg_temp.ready_tasks('50000000-0000-4000-8000-0000000111a3')) is distinct from 'done' then
    raise exception 'FAIL 10: reaching Ready to post with everything scheduled: done at once';
  end if;
end $$;

-- 11. Signed-in people still only read their tasks (the new column changes nothing there), and can't write them.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000111a1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from tasks where user_id = '00000000-0000-4000-8000-0000000111a2') then raise exception 'FAIL 11: someone else''s tasks are readable'; end if;
    begin
      update tasks set done_by_schedule = true where user_id = '00000000-0000-4000-8000-0000000111a1';
      raise exception 'FAIL 11: a person wrote a task';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
