-- ============================================================================
-- 0111: "Schedule the posts" is done once it's scheduled (1.35.2)
--
-- The owner (Oct 26 2026): "if you do the tasks earlier than the date they are
-- set for, will they automatically be done once the day comes? i feel like we
-- should count them as soon as you do them even if they're upcoming".
--
-- Every task is done the moment its video moves past its step, except one: a
-- short's Ready to post task (its scheduler's "Schedule the posts") only
-- closed when the short became Posted, that is when its last post went out on
-- the day, however early everything was scheduled. Now it's done as soon as
-- every platform the short goes to has its post set up: scheduled, on its way
-- or out (social_posts, not failed or cancelled), or marked posted by hand
-- (short_video_posts). If one of them is then cancelled or fails while the
-- short is still at Ready to post, that task comes back (the same task, so the
-- history doesn't keep a second one).
--
--   * tasks.done_by_schedule: done that way (only those come back).
--   * short_ready_scheduled(short): every platform set up.
--   * sync_item_tasks: 0054's, plus the above (it no longer adds a new Ready
--     to post task once the scheduling is done).
--   * Triggers: a post scheduled, cancelled or failing, or marked posted by
--     hand, re-syncs the short's tasks, and so does a change of its
--     platforms (added to short_videos' tasks_sync).
--
-- supabase/tests/ready-task-scheduled.test.sql checks it. Additive; safe to
-- run twice. Staging first, then production.
-- ============================================================================

alter table tasks add column if not exists done_by_schedule boolean not null default false;

-- Every platform the short goes to has its post set up.
create or replace function short_ready_scheduled(p_short uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select cardinality(s.platforms) > 0
       and not exists (
         select 1
           from unnest(s.platforms) as p(platform)
          where not exists (select 1 from short_video_posts v where v.short_id = s.id and v.platform = p.platform)
            and not exists (
              select 1 from social_posts sp
               where sp.short_id = s.id and sp.platform = p.platform::text and sp.status not in ('failed', 'cancelled')
            )
       )
      from short_videos s
     where s.id = p_short
  ), false);
$$;
revoke all on function short_ready_scheduled(uuid) from public, anon, authenticated;

create or replace function sync_item_tasks(p_kind text, p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
  v_stage text;
  v_due date;
  v_order text[];
  v_cur int;
  v_want jsonb;
  -- 0111: a short at Ready to post with every platform set up.
  v_sched boolean := false;
begin
  if p_kind = 'short' then
    select team_id, stage::text, planned_date into v_team, v_stage, v_due from short_videos where id = p_id;
    v_order := array['script', 'editing', 'review', 'ready', 'posted'];
    v_sched := v_stage = 'ready' and short_ready_scheduled(p_id);
  else
    select team_id, stage::text, expected_date into v_team, v_stage, v_due from long_video_projects where id = p_id;
    v_order := array['ideate', 'research', 'script', 'film', 'edit', 'review', 'package', 'publish', 'done'];
  end if;

  if v_team is null then
    delete from tasks where kind = p_kind and item_id = p_id and state <> 'done';
    return;
  end if;
  v_cur := array_position(v_order, v_stage);

  -- Who should have a task, for this step and every later one.
  if p_kind = 'short' then
    select coalesce(jsonb_agg(jsonb_build_object('stage', x.stage, 'user_id', x.user_id, 'member_id', x.member_id)), '[]'::jsonb) into v_want
      from (
        select 'script' as stage, tm.user_id, tm.id as member_id
          from short_scripters ss join team_members tm on tm.id = ss.team_member_id
         where ss.short_id = p_id and tm.user_id is not null and tm.status = 'active'
        union all
        select v.stage, tm.user_id, tm.id
          from short_videos s
          cross join lateral (values ('editing', s.editor_member_id), ('review', s.reviewer_member_id), ('ready', s.scheduler_member_id)) as v(stage, member_id)
          join team_members tm on tm.id = v.member_id
         where s.id = p_id and tm.user_id is not null and tm.status = 'active'
      ) x
     where array_position(v_order, x.stage) >= v_cur;
  else
    select coalesce(jsonb_agg(jsonb_build_object('stage', x.stage, 'user_id', x.user_id, 'member_id', x.member_id)), '[]'::jsonb) into v_want
      from (
        select pa.stage::text as stage, tm.user_id, tm.id as member_id
          from project_assignees pa join team_members tm on tm.id = pa.team_member_id
         where pa.project_id = p_id and pa.stage::text <> 'script' and tm.user_id is not null and tm.status = 'active'
        union all
        select 'script', tm.user_id, tm.id
          from long_video_scripters ls join team_members tm on tm.id = ls.team_member_id
         where ls.project_id = p_id and tm.user_id is not null and tm.status = 'active'
      ) x
     where array_position(v_order, x.stage) >= v_cur and x.stage not in ('ideate', 'done');
  end if;

  -- Steps the video has moved past: done (credited to whoever had them).
  update tasks t set state = 'done', completed_at = now()
   where t.kind = p_kind and t.item_id = p_id and t.state <> 'done'
     and array_position(v_order, t.stage) < v_cur;

  if p_kind = 'short' and v_stage = 'ready' then
    if v_sched then
      -- 0111: every platform set up: "Schedule the posts" is done now, not when the last post goes out.
      update tasks t set state = 'done', completed_at = now(), done_by_schedule = true
       where t.kind = 'short' and t.item_id = p_id and t.stage = 'ready' and t.state <> 'done';
    else
      -- One of them cancelled or failed (or a platform added) since: that same task is open again.
      update tasks t set state = 'active', completed_at = null, done_by_schedule = false, activated_at = now()
       where t.id in (
         select distinct on (d.user_id) d.id
           from tasks d
          where d.kind = 'short' and d.item_id = p_id and d.stage = 'ready' and d.state = 'done' and d.done_by_schedule
            and not exists (
              select 1 from tasks o
               where o.kind = 'short' and o.item_id = p_id and o.stage = 'ready' and o.user_id = d.user_id and o.state <> 'done'
            )
          order by d.user_id, d.completed_at desc
       );
    end if;
  end if;

  -- No longer assigned: the open task goes.
  delete from tasks t
   where t.kind = p_kind and t.item_id = p_id and t.state <> 'done'
     and not exists (
       select 1 from jsonb_to_recordset(v_want) as w(stage text, user_id uuid, member_id uuid)
        where w.stage = t.stage and w.user_id = t.user_id
     );

  -- Everyone who should have one: active (their turn) or waiting. (0111: not Ready to post's once it's scheduled.)
  insert into tasks (team_id, user_id, member_id, kind, item_id, stage, state, due_date, activated_at)
  select distinct on (w.stage, w.user_id)
         v_team, w.user_id, w.member_id, p_kind, p_id, w.stage,
         case when w.stage = v_stage then 'active' else 'waiting' end,
         v_due,
         case when w.stage = v_stage then now() end
    from jsonb_to_recordset(v_want) as w(stage text, user_id uuid, member_id uuid)
   where not (v_sched and w.stage = 'ready')
  on conflict (kind, item_id, stage, user_id) where state <> 'done'
  do update set
    state = excluded.state,
    due_date = excluded.due_date,
    member_id = excluded.member_id,
    activated_at = case when tasks.state <> 'active' and excluded.state = 'active' then now() else tasks.activated_at end;
end;
$$;
revoke all on function sync_item_tasks(text, uuid) from public, anon, authenticated;

-- A post scheduled, cancelled, failing or out; or marked posted by hand: the short's tasks again.
create or replace function tasks_sync_short_posts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_item_tasks('short', coalesce(new.short_id, old.short_id));
  return null;
end; $$;
revoke all on function tasks_sync_short_posts() from public, anon, authenticated;

drop trigger if exists tasks_sync on social_posts;
create trigger tasks_sync after insert or delete on social_posts
  for each row execute procedure tasks_sync_short_posts();
-- Its status only (a post on its way updates its progress every few seconds).
drop trigger if exists tasks_sync_status on social_posts;
create trigger tasks_sync_status after update of status on social_posts
  for each row when (old.status is distinct from new.status) execute procedure tasks_sync_short_posts();
drop trigger if exists tasks_sync on short_video_posts;
create trigger tasks_sync after insert or delete on short_video_posts
  for each row execute procedure tasks_sync_short_posts();

-- short_videos: its platforms too (0053's list plus platforms).
drop trigger if exists tasks_sync on short_videos;
create trigger tasks_sync after insert or delete or update of stage, planned_date, editor_member_id, reviewer_member_id, scheduler_member_id, platforms
  on short_videos for each row execute procedure tasks_sync_short();

-- Shorts at Ready to post now: their scheduling may be done already.
do $$
declare r record;
begin
  for r in select id from short_videos where stage = 'ready' loop perform sync_item_tasks('short', r.id); end loop;
end $$;
