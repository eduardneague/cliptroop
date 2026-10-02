-- ============================================================================
-- 0054: task sync without a temporary table
--
-- 0053's sync used a temp table inside the trigger; where temp tables aren't
-- allowed that made stage changes fail ("can't send the short to editing").
-- Same behaviour, the wanted tasks kept in a jsonb value instead.
-- Safe to run whether or not 0053's version is installed.
-- ============================================================================

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
begin
  if p_kind = 'short' then
    select team_id, stage::text, planned_date into v_team, v_stage, v_due from short_videos where id = p_id;
    v_order := array['script', 'editing', 'review', 'ready', 'posted'];
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

  -- No longer assigned: the open task goes.
  delete from tasks t
   where t.kind = p_kind and t.item_id = p_id and t.state <> 'done'
     and not exists (
       select 1 from jsonb_to_recordset(v_want) as w(stage text, user_id uuid, member_id uuid)
        where w.stage = t.stage and w.user_id = t.user_id
     );

  -- Everyone who should have one: active (their turn) or waiting.
  insert into tasks (team_id, user_id, member_id, kind, item_id, stage, state, due_date, activated_at)
  select distinct on (w.stage, w.user_id)
         v_team, w.user_id, w.member_id, p_kind, p_id, w.stage,
         case when w.stage = v_stage then 'active' else 'waiting' end,
         v_due,
         case when w.stage = v_stage then now() end
    from jsonb_to_recordset(v_want) as w(stage text, user_id uuid, member_id uuid)
  on conflict (kind, item_id, stage, user_id) where state <> 'done'
  do update set
    state = excluded.state,
    due_date = excluded.due_date,
    member_id = excluded.member_id,
    activated_at = case when tasks.state <> 'active' and excluded.state = 'active' then now() else tasks.activated_at end;
end;
$$;
revoke all on function sync_item_tasks(text, uuid) from public, anon, authenticated;
