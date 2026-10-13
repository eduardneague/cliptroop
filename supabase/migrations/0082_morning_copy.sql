-- ============================================================================
-- 0082: the morning analytics copy can't get stuck any more (1.17.0)
--
--   * job_runs: every run of the morning copy (one per team and platform)
--     writes when it started and when it finished, how it went, and why not.
--     A run that started but never finished ran out of time. The status page
--     and Developer → Status read it, so the cause of a late copy is visible.
--   * analytics_morning(): the 05:10 UTC timer no longer asks the app to copy
--     every team and platform in one call (one slow platform used every
--     second of it, and nothing was saved). It sends one call per team and
--     platform instead, each with its own time. Two more calls, at 05:40 and
--     06:40, copy whatever didn't finish (a platform that was down, say).
--   * record_app_error(): problems found by the status check ("job") email
--     the developers once when they start and then at most once a day (not
--     every hour); errors from the app itself keep the hourly limit.
--   * status_checks(): adds the morning copy's last runs and how many
--     accounts are connected.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create table if not exists job_runs (
  id bigserial primary key,
  job text not null check (job in ('analytics', 'cleanup')),
  team_id uuid references teams(id) on delete cascade,
  platform text check (platform is null or platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  -- What happened (rows copied, or the error), for the developers.
  detail text check (detail is null or char_length(detail) <= 2000)
);
create index if not exists job_runs_job_started_idx on job_runs (job, started_at desc);
alter table job_runs enable row level security;
revoke all on job_runs from anon, authenticated;
-- No policies: only the server (service role) reads and writes it.

-- One call per team and platform, each with its own time limit in the app.
create or replace function analytics_morning()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct team_id, platform
      from social_accounts
     where status = 'active'
       and platform in ('youtube', 'instagram', 'tiktok', 'facebook')
  loop
    perform posting_call(jsonb_build_object('job', 'analytics', 'team', r.team_id, 'platform', r.platform));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function analytics_morning() from public, anon, authenticated;

-- Scheduling the same name again just updates it.
select cron.schedule('vplanner-analytics', '10 5 * * *', $$ select analytics_morning(); $$);
-- Whatever didn't finish at 05:10 (or the projections of teams without accounts), twice.
select cron.schedule('vplanner-analytics-retry', '40 5,6 * * *', $$ select posting_call('{"job": "analytics", "retry": true}'::jsonb); $$);

-- Alerts: the status check's problems ("job") once a day, the rest once an hour.
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
        -- The newest details (a status problem's "how long ago" changes).
        stack = coalesce(excluded.stack, e.stack),
        message = excluded.message,
        resolved_at = null,
        alerted_at = case when e.resolved_at is not null then null else e.alerted_at end
  returning * into r;
  v_alert := r.alerted_at is null or r.alerted_at < now() - case when r.source = 'job' then interval '24 hours' else interval '1 hour' end;
  if v_alert then
    update app_errors set alerted_at = now() where id = r.id;
  end if;
  return jsonb_build_object('id', r.id, 'count', r.count, 'alert', v_alert, 'first', r.count = 1);
end;
$$;
revoke all on function record_app_error(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function record_app_error(text, text, text, text, text, text, uuid) to service_role;

/* The status page's numbers (server only); 0082 adds the morning copy's runs and the connected accounts. */
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
    select d.start_time, d.status, d.return_message into r
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = 'vplanner-posting'
     order by d.start_time desc limit 1;
    v := v || jsonb_build_object(
      'timer_scheduled', exists (select 1 from cron.job where jobname = 'vplanner-posting'),
      'timer_last', case when r is null then null else jsonb_build_object('at', r.start_time, 'status', r.status, 'message', left(r.return_message, 200)) end);
  exception when others then
    v := v || jsonb_build_object('timer_scheduled', null, 'timer_last', null);
  end;
  begin
    v := v || jsonb_build_object(
      'analytics_last', (select max(last_run_at) from analytics_syncs),
      'analytics_last_ok', (select max(last_ok_at) from analytics_syncs),
      'analytics_failing', (select count(*) from analytics_syncs where last_error is not null),
      'analytics_accounts', (select count(*) from social_accounts where status = 'active'));
  exception when others then
    v := v || jsonb_build_object('analytics_last', null, 'analytics_failing', null);
  end;
  begin
    v := v || jsonb_build_object('analytics_job', jsonb_build_object(
      'started', (select max(started_at) from job_runs where job = 'analytics'),
      'finished', (select max(finished_at) from job_runs where job = 'analytics'),
      -- Started more than 10 minutes ago and never finished: it ran out of time.
      'unfinished', (select count(*) from job_runs where job = 'analytics' and finished_at is null and started_at < now() - interval '10 minutes' and started_at > now() - interval '30 hours'),
      'failed', (select count(*) from job_runs where job = 'analytics' and ok = false and started_at > now() - interval '30 hours'),
      'problem', (select left(coalesce(detail, 'It started and never finished (out of time).'), 300) from job_runs
                   where job = 'analytics' and started_at > now() - interval '30 hours'
                     and (ok = false or (finished_at is null and started_at < now() - interval '10 minutes'))
                   order by started_at desc limit 1)));
  exception when others then
    v := v || jsonb_build_object('analytics_job', null);
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
