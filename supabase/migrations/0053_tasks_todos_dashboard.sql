-- ============================================================================
-- 0053: tasks, personal to-dos, dashboard layout
--
-- TASKS come from the work itself (nothing to create by hand):
--   assigned to a step → a task for that person on that video.
--     state 'active'  : the video is at that step now (your turn)
--     state 'waiting' : the video hasn't reached that step yet
--     state 'done'    : the video moved past it (completed_at = when)
--   Moving a video back opens new tasks; done ones stay in the history.
--   Kept in sync by triggers on the videos and their people, so it can
--   never drift. Each person only sees their own tasks.
--   (0054 replaces the sync function: no temporary table.)
--
--   Shorts: script → scripters · editing → editor · review → reviewer ·
--           ready → scheduler.
--   Long:   research / film / edit / review / package / publish → the
--           step's assignees · script → the video's scripters.
--
-- TODOS: a personal to-do list (only you see yours).
-- profiles.dashboard_layout: your widgets and their order / sizes.
-- Staging first, then production.
-- ============================================================================

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  member_id uuid references team_members(id) on delete set null,
  kind text not null check (kind in ('short', 'long')),
  item_id uuid not null,
  stage text not null,
  state text not null check (state in ('active', 'waiting', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists tasks_open_unique on tasks (kind, item_id, stage, user_id) where state <> 'done';
create index if not exists tasks_user_state_idx on tasks (user_id, state, due_date);
create index if not exists tasks_user_done_idx on tasks (user_id, completed_at desc) where state = 'done';
create index if not exists tasks_item_idx on tasks (kind, item_id);
create index if not exists tasks_team_idx on tasks (team_id);
create index if not exists tasks_member_idx on tasks (member_id);

alter table tasks enable row level security;
revoke all on tasks from anon, authenticated;
grant select on tasks to authenticated;
drop policy if exists "your own tasks" on tasks;
create policy "your own tasks" on tasks for select to authenticated using (user_id = auth.uid());

-- Recompute one video's tasks from its current step, date and people.
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
begin
  if p_kind = 'short' then
    select team_id, stage::text, planned_date into v_team, v_stage, v_due from short_videos where id = p_id;
    v_order := array['script', 'editing', 'review', 'ready', 'posted'];
  else
    select team_id, stage::text, expected_date into v_team, v_stage, v_due from long_video_projects where id = p_id;
    v_order := array['ideate', 'research', 'script', 'film', 'edit', 'review', 'package', 'publish', 'done'];
  end if;

  if v_team is null then
    -- The video is gone: open tasks go; the history stays.
    delete from tasks where kind = p_kind and item_id = p_id and state <> 'done';
    return;
  end if;
  v_cur := array_position(v_order, v_stage);

  -- Who should have a task, for this step and every later one.
  perform set_config('client_min_messages', 'warning', true);
  create temporary table if not exists _want (stage text, user_id uuid, member_id uuid) on commit drop;
  delete from _want;
  if p_kind = 'short' then
    insert into _want
      select 'script', tm.user_id, tm.id from short_scripters ss join team_members tm on tm.id = ss.team_member_id
       where ss.short_id = p_id and tm.user_id is not null and tm.status = 'active'
      union all
      select x.stage, tm.user_id, tm.id
        from short_videos s
        cross join lateral (values ('editing', s.editor_member_id), ('review', s.reviewer_member_id), ('ready', s.scheduler_member_id)) as x(stage, member_id)
        join team_members tm on tm.id = x.member_id
       where s.id = p_id and tm.user_id is not null and tm.status = 'active';
  else
    insert into _want
      select pa.stage::text, tm.user_id, tm.id from project_assignees pa join team_members tm on tm.id = pa.team_member_id
       where pa.project_id = p_id and pa.stage::text <> 'script' and tm.user_id is not null and tm.status = 'active'
      union all
      select 'script', tm.user_id, tm.id from long_video_scripters ls join team_members tm on tm.id = ls.team_member_id
       where ls.project_id = p_id and tm.user_id is not null and tm.status = 'active';
  end if;
  delete from _want w where array_position(v_order, w.stage) is null or array_position(v_order, w.stage) < v_cur
    or w.stage in ('posted', 'done', 'ideate');

  -- Steps the video has moved past: done (credited to whoever had them).
  update tasks t set state = 'done', completed_at = now()
   where t.kind = p_kind and t.item_id = p_id and t.state <> 'done'
     and array_position(v_order, t.stage) < v_cur;

  -- No longer assigned: the open task goes.
  delete from tasks t
   where t.kind = p_kind and t.item_id = p_id and t.state <> 'done'
     and not exists (select 1 from _want w where w.stage = t.stage and w.user_id = t.user_id);

  -- Everyone who should have one: active (their turn) or waiting.
  insert into tasks (team_id, user_id, member_id, kind, item_id, stage, state, due_date, activated_at)
  select distinct on (w.stage, w.user_id)
         v_team, w.user_id, w.member_id, p_kind, p_id, w.stage,
         case when w.stage = v_stage then 'active' else 'waiting' end,
         v_due,
         case when w.stage = v_stage then now() end
    from _want w
  on conflict (kind, item_id, stage, user_id) where state <> 'done'
  do update set
    state = excluded.state,
    due_date = excluded.due_date,
    member_id = excluded.member_id,
    activated_at = case when tasks.state <> 'active' and excluded.state = 'active' then now() else tasks.activated_at end;
end;
$$;
revoke all on function sync_item_tasks(text, uuid) from public, anon, authenticated;

-- Triggers: anything that changes a video's step, date or people.
create or replace function tasks_sync_short() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_item_tasks('short', coalesce(new.id, old.id));
  return null;
end; $$;
create or replace function tasks_sync_long() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_item_tasks('long', coalesce(new.id, old.id));
  return null;
end; $$;
create or replace function tasks_sync_short_people() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_item_tasks('short', coalesce(new.short_id, old.short_id));
  return null;
end; $$;
create or replace function tasks_sync_long_people() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_item_tasks('long', coalesce(new.project_id, old.project_id));
  return null;
end; $$;

drop trigger if exists tasks_sync on short_videos;
create trigger tasks_sync after insert or delete or update of stage, planned_date, editor_member_id, reviewer_member_id, scheduler_member_id
  on short_videos for each row execute procedure tasks_sync_short();
drop trigger if exists tasks_sync on long_video_projects;
create trigger tasks_sync after insert or delete or update of stage, expected_date
  on long_video_projects for each row execute procedure tasks_sync_long();
drop trigger if exists tasks_sync on short_scripters;
create trigger tasks_sync after insert or delete on short_scripters for each row execute procedure tasks_sync_short_people();
drop trigger if exists tasks_sync on project_assignees;
create trigger tasks_sync after insert or delete on project_assignees for each row execute procedure tasks_sync_long_people();
drop trigger if exists tasks_sync on long_video_scripters;
create trigger tasks_sync after insert or delete on long_video_scripters for each row execute procedure tasks_sync_long_people();

-- Existing work gets its tasks now.
do $$
declare r record;
begin
  for r in select id from short_videos loop perform sync_item_tasks('short', r.id); end loop;
  for r in select id from long_video_projects loop perform sync_item_tasks('long', r.id); end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Personal to-dos
-- ---------------------------------------------------------------------------

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  notes text check (notes is null or char_length(notes) <= 4000),
  due_date date,
  priority smallint not null default 0 check (priority between 0 and 3),
  position double precision not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on todos (user_id, done_at, position);
alter table todos enable row level security;
drop policy if exists "your own todos" on todos;
create policy "your own todos" on todos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Your dashboard layout
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists dashboard_layout jsonb;
grant update (dashboard_layout) on profiles to authenticated;
