-- ============================================================================
-- 0066: "Staging done" — the optional last tick of the script flow
--
--   Script → Review → Staging → ✓ Done. Anyone on the video's script
--   (masters, scripters, reviewers, staging people) can mark it done at any
--   time, whether or not the earlier steps were handed on: it's there to look
--   good and keep things tidy, never required. It notifies everyone involved,
--   puts a tick on every step, and closes any open Review / Staging tasks.
--   It can be undone (the tasks reopen if the step is still in progress).
--
--   Stored as one more hand-off: from 'staging' to 'done' on the Staging
--   document. Safe to run twice. Applied by the Database Action.
-- ============================================================================

-- Allow the new hand-off kind (the old checks were auto-named: found by definition).
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'script_handoffs'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) ~ 'from_step' or pg_get_constraintdef(oid) ~ 'to_step')
  loop
    execute format('alter table script_handoffs drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table script_handoffs add constraint script_handoffs_from_step_check check (from_step in ('write', 'review', 'staging'));
alter table script_handoffs add constraint script_handoffs_to_step_check check (to_step in ('review', 'staging', 'done'));
alter table script_handoffs add constraint script_handoffs_done_shape check ((to_step = 'done') = (from_step = 'staging'));

-- Tasks: marked done also closes the Review / Staging tasks of that video.
create or replace function sync_script_tasks(p_script uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  d scripts%rowtype;
  v_in timestamptz;
  v_out timestamptz;
  v_done timestamptz;
  v_stage text;
  v_due date;
  v_open boolean;
begin
  select * into d from scripts where id = p_script;
  if d.id is null or d.step is null or d.step not in ('review', 'staging') then
    delete from tasks where kind = 'script' and item_id = p_script and state <> 'done';
    return;
  end if;
  select max(created_at) into v_in from script_handoffs where to_script_id = d.id;
  select max(created_at) into v_out from script_handoffs where script_id = d.id and to_step <> 'done';
  select max(h.created_at) into v_done
    from script_handoffs h
    join scripts s on s.id = h.script_id
   where h.to_step = 'done'
     and ((d.short_video_id is not null and s.short_video_id = d.short_video_id) or (d.long_video_id is not null and s.long_video_id = d.long_video_id));
  if d.short_video_id is not null then
    select stage::text, planned_date into v_stage, v_due from short_videos where id = d.short_video_id;
    v_open := v_stage = 'script';
  else
    select stage::text, expected_date into v_stage, v_due from long_video_projects where id = d.long_video_id;
    v_open := v_stage in ('ideate', 'research', 'script');
  end if;

  -- Not sent to this step yet: no task.
  if v_in is null then
    delete from tasks where kind = 'script' and item_id = d.id and state <> 'done';
    return;
  end if;
  -- Sent on since, marked done since, or the video has moved past writing: done.
  if (v_out is not null and v_out > v_in) or (v_done is not null and v_done >= v_in) or not coalesce(v_open, false) then
    update tasks set state = 'done', completed_at = coalesce(greatest(v_out, v_done), now())
     where kind = 'script' and item_id = d.id and state <> 'done';
    return;
  end if;

  delete from tasks t
   where t.kind = 'script' and t.item_id = d.id and t.state <> 'done'
     and not exists (
       select 1 from script_step_member_ids(d.id) as x(member_id) join team_members m on m.id = x.member_id
        where m.user_id = t.user_id
     );
  insert into tasks (team_id, user_id, member_id, kind, item_id, stage, state, due_date, activated_at)
  select distinct on (m.user_id) d.team_id, m.user_id, m.id, 'script', d.id, d.step, 'active', v_due, now()
    from script_step_member_ids(d.id) as x(member_id)
    join team_members m on m.id = x.member_id
   where m.user_id is not null
  on conflict (kind, item_id, stage, user_id) where state <> 'done'
  do update set due_date = excluded.due_date, member_id = excluded.member_id;
end;
$$;
revoke all on function sync_script_tasks(uuid) from public, anon, authenticated;

-- Mark (or unmark) a video's script as done. p_script: any of its documents.
create or replace function script_finish(p_script uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d scripts%rowtype;
  st scripts%rowtype;
  rv scripts%rowtype;
  v_users uuid[];
  v_was boolean;
begin
  select * into d from scripts where id = p_script;
  if d.id is null or d.team_id not in (select my_team_ids()) then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  select * into st from scripts
   where step = 'staging'
     and ((d.short_video_id is not null and short_video_id = d.short_video_id) or (d.long_video_id is not null and long_video_id = d.long_video_id));
  select * into rv from scripts
   where step = 'review'
     and ((d.short_video_id is not null and short_video_id = d.short_video_id) or (d.long_video_id is not null and long_video_id = d.long_video_id));
  if st.id is null then
    raise exception 'The Staging document is missing. Open the script once so it''s created.' using errcode = 'P0002';
  end if;
  -- Masters, the video's scripters, its reviewers and its staging people.
  if not (
    is_team_master(d.team_id)
    or can_edit_doc(st.team_id, st.short_video_id, st.long_video_id, 'script')
    or is_script_step_person(st.id)
    or (rv.id is not null and is_script_step_person(rv.id))
  ) then
    raise exception 'Only the people on this script (or a master) can mark it done.' using errcode = '42501';
  end if;

  v_was := exists (select 1 from script_handoffs where script_id = st.id and to_step = 'done');
  if p_done then
    if not v_was then
      insert into script_handoffs (script_id, to_script_id, team_id, from_step, to_step, handed_by)
      values (st.id, null, st.team_id, 'staging', 'done', auth.uid());
    end if;
  else
    delete from script_handoffs where script_id = st.id and to_step = 'done';
  end if;
  perform sync_script_tasks(st.id);
  if rv.id is not null then
    perform sync_script_tasks(rv.id);
  end if;

  -- Who hears about it: everyone on the script, plus the team's masters (not you).
  if p_done and not v_was then
    select coalesce(array_agg(distinct m.user_id), '{}') into v_users
      from team_members m
     where m.team_id = st.team_id
       and m.status = 'active'
       and m.user_id is not null
       and m.user_id is distinct from auth.uid()
       and (
         m.id in (select x from script_step_member_ids(st.id) as x)
         or (rv.id is not null and m.id in (select x from script_step_member_ids(rv.id) as x))
         or m.id in (select team_member_id from short_scripters where st.short_video_id is not null and short_id = st.short_video_id)
         or m.id in (select team_member_id from long_video_scripters where st.long_video_id is not null and project_id = st.long_video_id)
         or exists (select 1 from member_roles r where r.team_member_id = m.id and r.role = 'master')
       );
  else
    v_users := '{}';
  end if;

  return jsonb_build_object(
    'done', p_done,
    'changed', p_done <> v_was,
    'staging_id', st.id,
    'team', st.team_id,
    'short', st.short_video_id,
    'long', st.long_video_id,
    'recipients', to_jsonb(v_users)
  );
end;
$$;
revoke all on function script_finish(uuid, boolean) from public, anon;
grant execute on function script_finish(uuid, boolean) to authenticated;
