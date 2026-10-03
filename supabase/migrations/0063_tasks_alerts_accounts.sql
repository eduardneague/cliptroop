-- ============================================================================
-- 0063: tasks for everything, one account = one team, error log
--
--   * Tasks (My tasks, the contribution grid) now also come from:
--       - meeting action items: the owner gets a task (due on its date),
--         done when the item is ticked, gone if it's removed or reassigned;
--       - script hand-offs: when a script is sent to Review / Staging, that
--         step's people get a task; done when it's sent on (Review → Staging)
--         or when the video moves past its writing steps.
--     Kinds 'meeting' (item = meeting_actions.id) and 'script' (item = the
--     Review / Staging document). Kept in sync by triggers, like the rest.
--   * A connected channel / account / Page can be in ONE team only: a unique
--     index on (platform, external_id). If two teams share one today, this
--     migration stops and lists them: disconnect it from one team, run again.
--   * app_errors: errors from the app (server and browser), one row per kind
--     of error with a count, and record_app_error() which also says when to
--     send an alert (at most once an hour per error). status_checks() gives
--     the status page its numbers. Both for the server only.
--
-- Staging first, then production.
-- ============================================================================

-- One account, one team -------------------------------------------------------
do $$
declare
  dupes text;
begin
  select string_agg(format('%s %s (%s teams)', platform, coalesce(display_name, external_id), n), '; ')
    into dupes
    from (
      select platform, external_id, max(display_name) as display_name, count(*) as n
        from social_accounts
       group by platform, external_id
      having count(*) > 1
    ) d;
  if dupes is not null then
    raise exception 'These accounts are connected to more than one team: %. Disconnect each from all but one team (Team → Connected accounts), then run this migration again.', dupes;
  end if;
end;
$$;
create unique index if not exists social_accounts_one_team on social_accounts (platform, external_id);

alter table social_audit_log drop constraint if exists social_audit_log_action_check;
alter table social_audit_log add constraint social_audit_log_action_check
  check (action in ('connected', 'reconnected', 'disconnected', 'refresh_failed', 'refreshed', 'refused_taken'));

-- Tasks: more kinds -----------------------------------------------------------
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in ('short', 'long', 'script', 'meeting'));

-- Meeting action items → a task for their owner.
create or replace function sync_action_task(p_action uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  a meeting_actions%rowtype;
  v_member uuid;
begin
  select * into a from meeting_actions where id = p_action;
  if a.id is null then
    delete from tasks where kind = 'meeting' and item_id = p_action and state <> 'done';
    return;
  end if;
  -- Reassigned (or nobody's): the old owner's open task goes.
  delete from tasks where kind = 'meeting' and item_id = a.id and state <> 'done' and user_id is distinct from a.owner_id;
  if a.owner_id is null then
    return;
  end if;
  if a.done_at is not null then
    update tasks set state = 'done', completed_at = a.done_at where kind = 'meeting' and item_id = a.id and state <> 'done';
    return;
  end if;
  select id into v_member from team_members where team_id = a.team_id and user_id = a.owner_id and status = 'active' limit 1;
  if v_member is null then
    delete from tasks where kind = 'meeting' and item_id = a.id and state <> 'done';
    return;
  end if;
  insert into tasks (team_id, user_id, member_id, kind, item_id, stage, state, due_date, activated_at)
  values (a.team_id, a.owner_id, v_member, 'meeting', a.id, 'action', 'active', a.due_date, now())
  on conflict (kind, item_id, stage, user_id) where state <> 'done'
  do update set due_date = excluded.due_date, member_id = excluded.member_id;
end;
$$;
revoke all on function sync_action_task(uuid) from public, anon, authenticated;

create or replace function meeting_actions_tasks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform sync_action_task(coalesce(new.id, old.id));
  return null;
end;
$$;
drop trigger if exists meeting_actions_tasks on meeting_actions;
create trigger meeting_actions_tasks after insert or update or delete on meeting_actions
  for each row execute procedure meeting_actions_tasks();

-- Script Review / Staging → a task for that step's people while it's their turn.
create or replace function sync_script_tasks(p_script uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  d scripts%rowtype;
  v_in timestamptz;
  v_out timestamptz;
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
  select max(created_at) into v_out from script_handoffs where script_id = d.id;
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
  -- Sent on since, or the video has moved past writing: done.
  if (v_out is not null and v_out > v_in) or not coalesce(v_open, false) then
    update tasks set state = 'done', completed_at = coalesce(v_out, now()) where kind = 'script' and item_id = d.id and state <> 'done';
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

create or replace function script_handoffs_tasks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform sync_script_tasks(new.to_script_id);
  perform sync_script_tasks(new.script_id);
  return null;
end;
$$;
drop trigger if exists script_handoffs_tasks on script_handoffs;
create trigger script_handoffs_tasks after insert on script_handoffs
  for each row execute procedure script_handoffs_tasks();

create or replace function script_doc_people_tasks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform sync_script_tasks(coalesce(new.script_id, old.script_id));
  return null;
end;
$$;
drop trigger if exists script_doc_people_tasks on script_doc_people;
create trigger script_doc_people_tasks after insert or delete on script_doc_people
  for each row execute procedure script_doc_people_tasks();

-- The team's defaults changed: every document using them, that's been sent to its step.
create or replace function team_script_people_tasks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select distinct s.id
      from scripts s
      join script_handoffs h on h.to_script_id = s.id
     where s.team_id = coalesce(new.team_id, old.team_id) and s.step = coalesce(new.step, old.step)
  loop
    perform sync_script_tasks(r.id);
  end loop;
  return null;
end;
$$;
drop trigger if exists team_script_people_tasks on team_script_people;
create trigger team_script_people_tasks after insert or delete on team_script_people
  for each row execute procedure team_script_people_tasks();

-- The video moved on (or its date changed): its Review / Staging tasks follow.
create or replace function video_script_tasks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from scripts
     where step in ('review', 'staging')
       and ((tg_table_name = 'short_videos' and short_video_id = new.id) or (tg_table_name = 'long_video_projects' and long_video_id = new.id))
  loop
    perform sync_script_tasks(r.id);
  end loop;
  return null;
end;
$$;
drop trigger if exists short_videos_script_tasks on short_videos;
create trigger short_videos_script_tasks after update of stage, planned_date on short_videos
  for each row when (old.stage is distinct from new.stage or old.planned_date is distinct from new.planned_date)
  execute procedure video_script_tasks();
drop trigger if exists long_videos_script_tasks on long_video_projects;
create trigger long_videos_script_tasks after update of stage, expected_date on long_video_projects
  for each row when (old.stage is distinct from new.stage or old.expected_date is distinct from new.expected_date)
  execute procedure video_script_tasks();

-- Fill in what's already there.
do $$
declare
  r record;
begin
  for r in select id from meeting_actions where owner_id is not null and done_at is null loop
    perform sync_action_task(r.id);
  end loop;
  for r in select distinct to_script_id as id from script_handoffs where to_script_id is not null loop
    perform sync_script_tasks(r.id);
  end loop;
end;
$$;

-- Error log -------------------------------------------------------------------
create table if not exists app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null check (source in ('server', 'browser', 'job')),
  message text not null check (char_length(message) <= 500),
  route text check (char_length(route) <= 300),
  digest text check (char_length(digest) <= 100),
  stack text check (char_length(stack) <= 4000),
  last_user_id uuid references profiles(id) on delete set null,
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  alerted_at timestamptz,
  resolved_at timestamptz
);
create index if not exists app_errors_last_seen_idx on app_errors (last_seen desc);
create index if not exists app_errors_last_user_idx on app_errors (last_user_id);
alter table app_errors enable row level security;
revoke all on app_errors from anon, authenticated;
-- No policies: only the server (service role) reads and writes it.

/*
 * Count one error. Returns whether to send an alert now: the first time it's
 * seen, when it comes back after being marked fixed, or at most once an hour
 * while it keeps happening.
 */
create or replace function record_app_error(p_fingerprint text, p_source text, p_message text, p_route text, p_digest text, p_stack text, p_user uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r app_errors%rowtype;
  v_alert boolean;
begin
  insert into app_errors as e (fingerprint, source, message, route, digest, stack, last_user_id)
  values (left(p_fingerprint, 200), p_source, left(p_message, 500), left(p_route, 300), left(p_digest, 100), left(p_stack, 4000), p_user)
  on conflict (fingerprint) do update
    set count = e.count + 1,
        last_seen = now(),
        last_user_id = coalesce(excluded.last_user_id, e.last_user_id),
        digest = coalesce(excluded.digest, e.digest),
        stack = coalesce(excluded.stack, e.stack),
        resolved_at = null,
        alerted_at = case when e.resolved_at is not null then null else e.alerted_at end
  returning * into r;
  v_alert := r.alerted_at is null or r.alerted_at < now() - interval '1 hour';
  if v_alert then
    update app_errors set alerted_at = now() where id = r.id;
  end if;
  return jsonb_build_object('id', r.id, 'count', r.count, 'alert', v_alert);
end;
$$;
revoke all on function record_app_error(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function record_app_error(text, text, text, text, text, text, uuid) to service_role;

/* The status page's numbers (server only). Each part on its own, so one failing doesn't hide the rest. */
create or replace function status_checks()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  r record;
begin
  begin
    select d.start_time, d.status into r
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = 'vplanner-posting'
     order by d.start_time desc limit 1;
    v := v || jsonb_build_object(
      'timer_scheduled', exists (select 1 from cron.job where jobname = 'vplanner-posting'),
      'timer_last', case when r is null then null else jsonb_build_object('at', r.start_time, 'status', r.status) end);
  exception when others then
    v := v || jsonb_build_object('timer_scheduled', null, 'timer_last', null);
  end;
  begin
    v := v || jsonb_build_object('analytics_last', (select max(last_run_at) from analytics_syncs), 'analytics_failing', (select count(*) from analytics_syncs where last_error is not null));
  exception when others then
    v := v || jsonb_build_object('analytics_last', null, 'analytics_failing', null);
  end;
  begin
    v := v || jsonb_build_object(
      'posts_failed_24h', (select count(*) from social_posts where status = 'failed' and updated_at > now() - interval '24 hours'),
      'posts_published_24h', (select count(*) from social_posts where status = 'published' and updated_at > now() - interval '24 hours'));
  exception when others then
    v := v || jsonb_build_object('posts_failed_24h', null, 'posts_published_24h', null);
  end;
  v := v || jsonb_build_object(
    'errors_24h', (select coalesce(sum(count), 0) from app_errors where last_seen > now() - interval '24 hours' and resolved_at is null),
    'error_kinds_24h', (select count(*) from app_errors where last_seen > now() - interval '24 hours' and resolved_at is null),
    'accounts_needing_reconnect', (select count(*) from social_accounts where status = 'needs_reconnect'));
  return v;
end;
$$;
revoke all on function status_checks() from public, anon, authenticated;
grant execute on function status_checks() to service_role;
