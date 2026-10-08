-- ============================================================================
-- 0069: Clip's tutorial + a clearer reason when the status check fails
--
--   * profiles.tutorial_done_at: when someone finished or skipped Clip's
--     tour of the app (null = show it once). Each person can set or clear
--     only their own (column grant + the profiles update policy);
--     Settings -> Account -> Show me around again clears it.
--   * status_state keeps the last answer to the 10-minute status check
--     (time, HTTP code, why), shown on /developer. status_tick() now names
--     the usual causes: Vercel's protection (vercel_bypass in Vault), a
--     password mismatch (CRON_SECRET / cron_secret), a wrong posting_url.
--   * status_checks() also returns the timer's last error message.
-- Staging first, then production.
-- ============================================================================

alter table profiles add column if not exists tutorial_done_at timestamptz;
-- Your own row only (the profiles update policy); nothing else opens up.
grant update (tutorial_done_at) on profiles to authenticated;

alter table status_state add column if not exists last_answer_at timestamptz;
alter table status_state add column if not exists last_answer_code int;
alter table status_state add column if not exists last_answer text;

create or replace function status_tick()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  st status_state%rowtype;
  resp record;
  v_found boolean;
  v_code int;
  v_why text;
  v_req bigint;
begin
  select * into st from status_state where id;
  if st.last_request is not null then
    begin
      select status_code, timed_out, error_msg, left(content::text, 2000) as body into resp from net._http_response where id = st.last_request;
      v_found := found;
      v_code := case when v_found then resp.status_code else null end;
      v_why := case
        when not v_found then 'Didn''t answer the status check.'
        when coalesce(resp.timed_out, false) then 'Timed out.'
        when resp.status_code is null then left(coalesce('Not reachable: ' || resp.error_msg, 'Not reachable.'), 300)
        when resp.status_code between 200 and 299 then 'Answered (HTTP ' || resp.status_code || ').'
        when resp.status_code in (401, 403) and resp.body ilike '%vercel%' then
          'Vercel''s protection blocked the call (HTTP ' || resp.status_code || '): add or update the vercel_bypass secret in Vault (Vercel -> Settings -> Deployment Protection -> Protection Bypass for Automation).'
        when resp.status_code = 401 then 'The passwords don''t match (HTTP 401): CRON_SECRET in Vercel and cron_secret in Vault must be the same.'
        when resp.status_code = 404 then 'Wrong address (HTTP 404): check posting_url in Vault, and that this site has the latest code.'
        when resp.status_code >= 500 then 'Answered with an error (HTTP ' || resp.status_code || ').'
        else 'The app refused the call (HTTP ' || resp.status_code || '): check posting_url and cron_secret in Vault.'
      end;

      if not v_found or coalesce(resp.timed_out, false) or resp.status_code is null or resp.status_code >= 500 then
        insert into status_samples (at, component, level, detail) values (st.last_at, 'app', 'down', left(v_why, 300));
      else
        insert into status_samples (at, component, level, detail) values (st.last_at, 'app', 'ok', 'Answered (HTTP ' || resp.status_code || ').');
        -- It answered but refused the call: automatic posting can't work
        -- either (same address and password), and the app wrote nothing itself.
        if resp.status_code >= 400 then
          insert into status_samples (at, component, level, detail) values (st.last_at, 'timer', 'warn', left(v_why, 300));
        end if;
      end if;
      update status_state set last_answer_at = st.last_at, last_answer_code = v_code, last_answer = left(v_why, 300) where id;
    exception when others then
      null; -- never let the bookkeeping stop the next check
    end;
  end if;

  delete from status_samples where at < now() - interval '30 days';

  v_req := posting_call('{"status": true}'::jsonb);
  insert into status_state (id, last_request, last_at) values (true, v_req, now())
  on conflict (id) do update set last_request = excluded.last_request, last_at = excluded.last_at;
end;
$$;
revoke all on function status_tick() from public, anon, authenticated;

/* The status page's numbers (server only); 0069 adds the timer's last error message. */
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
