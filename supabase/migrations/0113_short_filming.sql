-- ============================================================================
-- 0113: a Filming step for shorts (1.36.0)
--
-- The owner (Oct 26 2026, 17:36): "for shorts, i want a filming step, the
-- same as longs". Script → Filming → Editing → In review → Ready to post →
-- Posted (0112 added the value). Like a long video's Film step: the filmer
-- marks it filmed (and where the footage is, a NAS folder), it moves to
-- Editing and the editor is told.
--
--   * short_videos: filmer_member_id (who films it), filmed_at / filmed_by
--     (when it was marked filmed, by whom), footage_path (where the footage
--     is, like a long video's nas_path; at most 500 characters).
--   * teams.default_short_filmer_member_id: Team → Defaults → Short videos
--     (new shorts start with it, as with the editor; column grant).
--   * short_mark_filmed(short, path): the short's filmer (with nobody set,
--     anyone with the Filmer role) or a master: Filming → Editing, with
--     filmed_at / filmed_by and the footage folder (kept if none is given).
--   * short_guard_update: 0038's, plus: only masters and schedulers change
--     who films; filmed_at / filmed_by only through short_mark_filmed (or a
--     master); the footage folder by a master, the filmer, the editor or a
--     scheduler. (Script → Filming is the master's, like Script → Editing.)
--   * short_check_editor / teams_check_short_settings: the filmer, and the
--     default filmer, must be active members of the team.
--   * sync_item_tasks: 0111's, plus Filming: the filmer's task ("Film it").
--   * vp_task_cat / vp_task_xp: a short's filming counts as filming, 30 XP
--     (lib/profile/progress.ts has the same numbers).
--
-- supabase/tests/short-filming.test.sql checks it. Additive; safe to run
-- twice. Staging first, then production.
-- ============================================================================

alter table short_videos
  add column if not exists filmer_member_id uuid references team_members(id) on delete set null,
  add column if not exists filmed_at timestamptz,
  add column if not exists filmed_by uuid references profiles(id) on delete set null,
  add column if not exists footage_path text check (footage_path is null or char_length(footage_path) <= 500);
create index if not exists short_videos_filmer_idx on short_videos (filmer_member_id);
create index if not exists short_videos_filmed_by_idx on short_videos (filmed_by);

alter table teams add column if not exists default_short_filmer_member_id uuid references team_members(id) on delete set null;
create index if not exists teams_default_short_filmer_idx on teams (default_short_filmer_member_id);
grant update (default_short_filmer_member_id) on teams to authenticated;

-- People on a short (now the filmer too) are active members of its team.
create or replace function short_check_editor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  foreach m in array array[new.editor_member_id, new.reviewer_member_id, new.scheduler_member_id, new.filmer_member_id] loop
    if m is not null and not exists (
      select 1 from team_members where id = m and team_id = new.team_id and status = 'active'
    ) then
      raise exception 'People on a short must be active members of this team.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists short_check_editor on short_videos;
create trigger short_check_editor
  before insert or update of editor_member_id, reviewer_member_id, scheduler_member_id, filmer_member_id on short_videos
  for each row execute procedure short_check_editor();

-- The team's defaults (now the filmer too).
create or replace function teams_check_short_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '23514';
  end;
  foreach m in array array[new.default_short_editor_member_id, new.default_short_reviewer_member_id, new.default_short_scheduler_member_id, new.default_short_scripter_member_id, new.default_short_filmer_member_id] loop
    if m is not null and not exists (
      select 1 from team_members where id = m and team_id = new.id and status = 'active'
    ) then
      raise exception 'Defaults must be active members of this team.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists teams_check_short_settings on teams;
create trigger teams_check_short_settings
  before insert or update of timezone, default_short_editor_member_id,
    default_short_reviewer_member_id, default_short_scheduler_member_id, default_short_scripter_member_id,
    default_short_filmer_member_id on teams
  for each row execute procedure teams_check_short_settings();

-- Who may change what on a short: 0038's, plus the filmer.
create or replace function short_guard_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_system boolean := current_setting('vp.short_system', true) = 'on';
  v_master boolean;
  v_scheduler boolean;
  v_editor boolean;
  v_reviewer boolean;
  v_filmer boolean;
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  if auth.uid() is null or v_system then
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.entry_number is distinct from old.entry_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.queue_position is distinct from old.queue_position then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  if new.approved_version_id is distinct from old.approved_version_id
     and not (old.stage = 'review' and new.stage = 'ready') then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  if old.stage = 'posted' and new.stage is distinct from old.stage then
    raise exception 'This short is posted and locked. Un-mark a platform to reopen it.' using errcode = '42501';
  end if;

  -- (Editing → In review needing a video is checked by short_review_gate.)

  if new.planned_date is distinct from old.planned_date then
    new.schedule_mode := case when new.planned_date is null then 'auto' else 'pinned' end;
  end if;
  if new.schedule_mode = 'auto' then
    if old.schedule_mode = 'pinned' then
      new.planned_date := null;
    end if;
    new.pin_kind := null;
  else
    new.pin_kind := coalesce(
      new.pin_kind, old.pin_kind,
      case when is_team_master(old.team_id) and (active_queue_start(old.team_id, old.id)).id is null then 'anchor' else 'oneoff' end
    );
    if old.schedule_mode <> 'pinned'
       or new.planned_date is distinct from old.planned_date
       or new.pin_kind is distinct from old.pin_kind then
      new.queue_position := short_position_for_date(new.team_id, new.planned_date, new.id);
    end if;
  end if;

  v_master := is_team_master(old.team_id);
  if v_master then
    return new;
  end if;

  v_scheduler := has_team_role(old.team_id, 'publisher');
  v_editor := exists (
    select 1 from team_members where id = old.editor_member_id and user_id = auth.uid() and status = 'active'
  );
  v_reviewer := exists (
    select 1 from team_members where id = old.reviewer_member_id and user_id = auth.uid() and status = 'active'
  );
  -- 0113: the short's filmer (or, with nobody set, anyone with the Filmer role).
  v_filmer := exists (
    select 1 from team_members where id = old.filmer_member_id and user_id = auth.uid() and status = 'active'
  ) or (old.filmer_member_id is null and has_team_role(old.team_id, 'filmer'));

  if new.stage is distinct from old.stage and not (
       (v_editor and old.stage = 'editing' and new.stage = 'review')
    or (v_reviewer and old.stage = 'review' and new.stage in ('ready', 'editing'))
  ) then
    raise exception 'You can''t move this short to that stage.' using errcode = '42501';
  end if;

  if new.review_note is distinct from old.review_note
     and not (v_reviewer and old.stage = 'review' and new.stage is distinct from old.stage) then
    raise exception 'Only the reviewer can leave review notes.' using errcode = '42501';
  end if;

  if (new.editor_member_id is distinct from old.editor_member_id
      or new.reviewer_member_id is distinct from old.reviewer_member_id
      or new.scheduler_member_id is distinct from old.scheduler_member_id
      or new.filmer_member_id is distinct from old.filmer_member_id)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change who works on a short.' using errcode = '42501';
  end if;

  -- Fixed dates and the queue start belong to the master.
  if old.schedule_mode = 'pinned'
     and (new.planned_date is distinct from old.planned_date
          or new.schedule_mode is distinct from old.schedule_mode
          or new.pin_kind is distinct from old.pin_kind) then
    raise exception 'Only the master can change a fixed date.' using errcode = '42501';
  end if;
  if new.pin_kind = 'anchor' and new.pin_kind is distinct from old.pin_kind then
    raise exception 'Only the master can start the queue.' using errcode = '42501';
  end if;

  -- Title, type, platforms and dates of Auto shorts: master or scheduler.
  if (new.title is distinct from old.title
      or new.planned_date is distinct from old.planned_date
      or new.schedule_mode is distinct from old.schedule_mode
      or new.pin_kind is distinct from old.pin_kind
      or new.platforms is distinct from old.platforms
      or new.short_type is distinct from old.short_type)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;

  if (new.caption is distinct from old.caption or new.caption_enabled is distinct from old.caption_enabled)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change the caption.' using errcode = '42501';
  end if;

  if new.keep_media is distinct from old.keep_media and not v_scheduler then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;

  -- 0113: when and by whom it was filmed: only short_mark_filmed (or a master) writes those.
  if new.filmed_at is distinct from old.filmed_at or new.filmed_by is distinct from old.filmed_by then
    raise exception 'Only the filmer can mark it filmed.' using errcode = '42501';
  end if;
  if new.footage_path is distinct from old.footage_path
     and not (v_filmer or v_editor or v_scheduler) then
    raise exception 'Only the master, its filmer, its editor or a scheduler can change where the footage is.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the final file.' using errcode = '42501';
  end if;

  return new;
end;
$$;


-- Filmed: Filming → Editing, with when, by whom and where the footage is.
create or replace function short_mark_filmed(p_short uuid, p_path text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  select * into s from short_videos where id = p_short for update;
  if s.id is null or s.team_id not in (select my_team_ids()) then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not (
    is_team_master(s.team_id)
    or exists (select 1 from team_members tm where tm.id = s.filmer_member_id and tm.user_id = auth.uid() and tm.status = 'active')
    or (s.filmer_member_id is null and has_team_role(s.team_id, 'filmer'))
  ) then
    raise exception 'Only its filmer (or the master) can mark it filmed.' using errcode = '42501';
  end if;
  if s.stage::text <> 'filming' then
    raise exception 'This short isn''t at Filming any more. Refresh the page.' using errcode = '23514';
  end if;
  if v_path is not null and char_length(v_path) > 500 then
    raise exception 'Keep the footage folder under 500 characters.' using errcode = '23514';
  end if;
  perform set_config('vp.short_system', 'on', true);
  update short_videos
     set stage = 'editing', filmed_at = now(), filmed_by = auth.uid(), footage_path = coalesce(v_path, footage_path)
   where id = p_short;
  perform set_config('vp.short_system', 'off', true);
end;
$$;
revoke all on function short_mark_filmed(uuid, text) from public, anon;
grant execute on function short_mark_filmed(uuid, text) to authenticated;

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
    v_order := array['script', 'filming', 'editing', 'review', 'ready', 'posted'];
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
          cross join lateral (values ('filming', s.filmer_member_id), ('editing', s.editor_member_id), ('review', s.reviewer_member_id), ('ready', s.scheduler_member_id)) as v(stage, member_id)
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

-- Its people changing re-syncs its tasks: the filmer too (0053's list, 0111's platforms, and the filmer).
drop trigger if exists tasks_sync on short_videos;
create trigger tasks_sync after insert or delete or update of stage, planned_date, editor_member_id, reviewer_member_id, scheduler_member_id, platforms, filmer_member_id
  on short_videos for each row execute procedure tasks_sync_short();

-- Achievements and XP: a short's filming counts as filming (the same numbers as lib/profile/progress.ts).
create or replace function vp_task_cat(p_kind text, p_stage text)
returns text
language sql
immutable
as $$
  select case
    when p_stage = 'script' and p_kind in ('short', 'long') then 'script'
    when (p_kind = 'short' and p_stage = 'editing') or (p_kind = 'long' and p_stage = 'edit') then 'edit'
    when (p_kind = 'short' and p_stage = 'filming') or (p_kind = 'long' and p_stage = 'film') then 'film'
    when p_kind = 'long' and p_stage = 'research' then 'research'
    when p_stage in ('review', 'staging') then 'review'
    when p_kind = 'long' and p_stage = 'package' then 'package'
    when (p_kind = 'short' and p_stage = 'ready') or (p_kind = 'long' and p_stage = 'publish') then 'publish'
    when p_kind = 'meeting' then 'action'
    else 'other'
  end;
$$;

create or replace function vp_task_xp(p_kind text, p_stage text)
returns int
language sql
immutable
as $$
  select case
    when p_kind = 'long' and p_stage = 'edit' then 90
    when p_kind = 'long' and p_stage = 'film' then 70
    when p_kind = 'long' and p_stage = 'script' then 60
    when p_kind = 'long' and p_stage = 'research' then 40
    when p_kind = 'short' and p_stage = 'editing' then 40
    when p_kind = 'long' and p_stage = 'package' then 35
    when p_kind = 'short' and p_stage = 'script' then 30
    when p_kind = 'short' and p_stage = 'filming' then 30
    when p_kind = 'long' and p_stage = 'review' then 25
    when p_kind = 'long' and p_stage = 'publish' then 20
    when p_kind in ('short', 'script') and p_stage = 'review' then 15
    else 10
  end;
$$;
