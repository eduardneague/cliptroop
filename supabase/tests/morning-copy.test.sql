-- Checks for 0082 (the morning copy can't get stuck): one timer call per
-- team and platform, the run log is server-only, the status numbers name
-- an unfinished run, and status problems email once a day (app errors once
-- an hour). Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'mc@example.com'),
  ('00000000-0000-4000-8000-0000000000c2', 'md@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'mc@example.com'),
  ('00000000-0000-4000-8000-0000000000c2', 'md@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000000c1', 'Team C', 'morning-team-c', '00000000-0000-4000-8000-0000000000c1'),
  ('10000000-0000-4000-8000-0000000000c2', 'Team D', 'morning-team-d', '00000000-0000-4000-8000-0000000000c2');
insert into social_accounts (team_id, platform, external_id, access_token_enc, status) values
  ('10000000-0000-4000-8000-0000000000c1', 'youtube', 'UC1', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000c1', 'instagram', 'IG1', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000c2', 'tiktok', 'TT1', 'v1:x', 'needs_reconnect')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. The 05:10 timer: one call per connected (active) team and platform.
select vault.create_secret('https://app.example.com/api/cron/posting', 'posting_url');
select vault.create_secret('0123456789abcdef0123456789abcdef', 'cron_secret');
do $$
declare
  before int := (select count(*) from net.http_request_queue);
  -- Other checks leave accounts of their own: every active team and platform, once.
  expected int := (select count(*) from (select distinct team_id, platform from social_accounts where status = 'active') x);
  n int;
  sent int;
begin
  n := analytics_morning();
  sent := (select count(*) from net.http_request_queue) - before;
  if n <> expected or sent <> expected then
    raise exception 'analytics_morning: expected % calls, got % (% sent)', expected, n, sent;
  end if;
  if exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%10000000-0000-4000-8000-0000000000c2%') then
    raise exception 'analytics_morning: an account that needs reconnecting is skipped';
  end if;
  if not exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%"platform": "instagram"%' and convert_from(body, 'utf8') like '%10000000-0000-4000-8000-0000000000c1%') then
    raise exception 'analytics_morning: each call names its team and platform';
  end if;
end $$;

-- The timers are scheduled.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vplanner-analytics' and command like '%analytics_morning()%') then
    raise exception 'the 05:10 timer calls analytics_morning()';
  end if;
  if not exists (select 1 from cron.job where jobname = 'vplanner-analytics-retry' and command like '%"retry": true%') then
    raise exception 'the retry timer is scheduled';
  end if;
end $$;

-- 2. job_runs: the server's only.
insert into job_runs (job, team_id, platform, started_at) values ('analytics', '10000000-0000-4000-8000-0000000000c1', 'youtube', now() - interval '2 hours');
insert into job_runs (job, team_id, platform, started_at, finished_at, ok, detail) values ('analytics', '10000000-0000-4000-8000-0000000000c1', 'instagram', now() - interval '2 hours', now() - interval '2 hours', true, '40 rows');
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
do $$
begin
  begin
    perform 1 from job_runs limit 1;
    raise exception 'job_runs readable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into job_runs (job) values ('analytics');
    raise exception 'job_runs writable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
  begin
    perform analytics_morning();
    raise exception 'analytics_morning() callable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
commit;

-- 3. The status numbers: an unfinished run is named.
do $$
declare
  s jsonb := status_checks();
begin
  if (s -> 'analytics_job' ->> 'unfinished')::int <> 1 then
    raise exception 'status_checks: one unfinished run expected, got %', s -> 'analytics_job';
  end if;
  if s -> 'analytics_job' ->> 'problem' not like '%out of time%' then
    raise exception 'status_checks: the unfinished run says it ran out of time, got %', s -> 'analytics_job' ->> 'problem';
  end if;
  if (s ->> 'analytics_accounts')::int < 2 then
    raise exception 'status_checks: counts the active accounts, got %', s ->> 'analytics_accounts';
  end if;
end $$;

-- 4. Alerts: a status problem once a day, an app error once an hour.
do $$
declare
  a jsonb;
begin
  a := record_app_error('t-job', 'job', 'Analytics updates: the morning copy is late', 'status check', null, 'Last copy 2 days ago', null);
  if not (a ->> 'alert')::boolean or not (a ->> 'first')::boolean then raise exception 'a new status problem alerts (got %)', a; end if;
  update app_errors set alerted_at = now() - interval '2 hours' where fingerprint = 't-job';
  a := record_app_error('t-job', 'job', 'Analytics updates: the morning copy is late', 'status check', null, 'Last copy 2 days ago', null);
  if (a ->> 'alert')::boolean then raise exception 'a status problem alerts at most once a day (got %)', a; end if;
  update app_errors set alerted_at = now() - interval '25 hours' where fingerprint = 't-job';
  a := record_app_error('t-job', 'job', 'Analytics updates: the morning copy is late', 'status check', null, 'Last copy 3 days ago', null);
  if not (a ->> 'alert')::boolean then raise exception 'a status problem alerts again after a day (got %)', a; end if;
  if (select stack from app_errors where fingerprint = 't-job') <> 'Last copy 3 days ago' then raise exception 'the newest details are kept'; end if;

  a := record_app_error('t-srv', 'server', 'TypeError: x is undefined', '/dashboard', null, null, null);
  update app_errors set alerted_at = now() - interval '2 hours' where fingerprint = 't-srv';
  a := record_app_error('t-srv', 'server', 'TypeError: x is undefined', '/dashboard', null, null, null);
  if not (a ->> 'alert')::boolean then raise exception 'an app error still alerts once an hour (got %)', a; end if;
end $$;

-- Clean up what other checks might count.
delete from job_runs;
delete from app_errors where fingerprint in ('t-job', 't-srv');
delete from social_accounts where team_id in ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c2');
delete from vault.secrets where name in ('posting_url', 'cron_secret');
