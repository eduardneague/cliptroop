-- Checks for 0083 (every video, numbers within minutes, impressions and
-- CTR): the 10-minute timer calls once per team and platform and drops old
-- counts, teammates read only their own team's counts, the hourly and
-- per-video sums spread a change over the time it happened in, and each
-- video's impressions / CTR over the days kept. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'le@example.com'),
  ('00000000-0000-4000-8000-0000000000f1', 'lf@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'le@example.com'),
  ('00000000-0000-4000-8000-0000000000f1', 'lf@example.com')
on conflict do nothing;
-- (Creating a team makes its owner a master member.)
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000000e1', 'Team E', 'live-team-e', '00000000-0000-4000-8000-0000000000e1'),
  ('10000000-0000-4000-8000-0000000000f1', 'Team F', 'live-team-f', '00000000-0000-4000-8000-0000000000f1');
insert into social_accounts (team_id, platform, external_id, access_token_enc, status) values
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'UCE', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000e1', 'tiktok', 'TTE', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000f1', 'instagram', 'IGF', 'v1:x', 'needs_reconnect')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. The timer: one call per active team and platform; counts older than 8 days go.
select vault.create_secret('https://app.example.com/api/cron/posting', 'posting_url');
select vault.create_secret('0123456789abcdef0123456789abcdef', 'cron_secret');
insert into analytics_live (team_id, platform, external_id, at, views) values
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'old', now() - interval '9 days', 5),
  -- Thinning: three looks in one hour two days ago (only the last stays), one in the next hour, one recent.
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', date_trunc('hour', now() - interval '52 hours') + interval '10 minutes', 1),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', date_trunc('hour', now() - interval '52 hours') + interval '20 minutes', 2),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', date_trunc('hour', now() - interval '52 hours') + interval '50 minutes', 3),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', date_trunc('hour', now() - interval '52 hours') + interval '70 minutes', 4),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', now() - interval '47 hours', 5),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'thin', now() - interval '47 hours' + interval '5 minutes', 6);
do $$
declare
  before int := (select count(*) from net.http_request_queue);
  expected int := (select count(*) from (select distinct team_id, platform from social_accounts where status = 'active') x);
  n int;
begin
  n := analytics_live_fanout();
  if n <> expected or (select count(*) from net.http_request_queue) - before <> expected then
    raise exception 'analytics_live_fanout: expected % calls, got %', expected, n;
  end if;
  if not exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%"job": "live"%' and convert_from(body, 'utf8') like '%"platform": "tiktok"%') then
    raise exception 'analytics_live_fanout: each call is a live job for one team and platform';
  end if;
  if exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%"job": "live"%' and convert_from(body, 'utf8') like '%10000000-0000-4000-8000-0000000000f1%') then
    raise exception 'analytics_live_fanout: an account that needs reconnecting is skipped';
  end if;
  if exists (select 1 from analytics_live where external_id = 'old') then
    raise exception 'analytics_live_fanout: counts older than 8 days are dropped';
  end if;
  if not exists (select 1 from cron.job where jobname = 'vplanner-live' and command like '%analytics_live_fanout()%') then
    raise exception 'the 10-minute live timer is scheduled';
  end if;
  if (select array_agg(views order by at) from analytics_live where external_id = 'thin') <> array[3, 4, 5, 6]::bigint[] then
    raise exception 'analytics_live_fanout: after 48 hours only the last count of each hour stays (got %)', (select array_agg(views order by at) from analytics_live where external_id = 'thin');
  end if;
end $$;
delete from analytics_live where external_id = 'thin';

-- 2. A video seen three times: 100 three hours ago, 160 two hours ago, 190 half an hour ago.
insert into analytics_live (team_id, platform, external_id, at, views, likes, comments) values
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', now() - interval '3 hours', 100, 10, 1),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', now() - interval '2 hours', 160, 14, 1),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', now() - interval '30 minutes', 190, 15, 2),
  -- A count that went down (YouTube removes spam views): never a negative gain.
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v2', now() - interval '2 hours', 50, 0, 0),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v2', now() - interval '1 hour', 45, 0, 0),
  ('10000000-0000-4000-8000-0000000000f1', 'instagram', 'x', now() - interval '2 hours', 1, 0, 0),
  ('10000000-0000-4000-8000-0000000000f1', 'instagram', 'x', now() - interval '1 hour', 999, 0, 0);

-- 3. Teammates read their own team's counts and sums only, and can't write.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
do $$
declare
  total bigint;
  last_hour bigint;
  hours int;
begin
  if (select count(*) from analytics_live) <> 5 then
    raise exception 'a teammate reads exactly their team''s counts, got %', (select count(*) from analytics_live);
  end if;
  select sum(views), count(*) into total, hours from analytics_live_hours('10000000-0000-4000-8000-0000000000e1', 48);
  -- (Each hour is rounded on its own: the sum can be one off.)
  if total not between 89 and 91 then
    raise exception 'analytics_live_hours: 90 views gained in all (got %)', total;
  end if;
  if hours < 2 then
    raise exception 'analytics_live_hours: a change is spread over the hours it happened in (got % hours)', hours;
  end if;
  if exists (select 1 from analytics_live_hours('10000000-0000-4000-8000-0000000000e1', 48) where views < 0) then
    raise exception 'analytics_live_hours: never negative';
  end if;
  -- Last 60 minutes: a third of the 30 gained between 2 h and 30 min ago.
  select views into last_hour from analytics_live_gains('10000000-0000-4000-8000-0000000000e1', 60) where external_id = 'v1';
  if last_hour <> 10 then
    raise exception 'analytics_live_gains: 10 views in the last hour (got %)', last_hour;
  end if;
  if (select views from analytics_live_gains('10000000-0000-4000-8000-0000000000e1', 2880) where external_id = 'v1') <> 90 then
    raise exception 'analytics_live_gains: 90 views in 48 hours';
  end if;
  if (select coalesce(sum(views), 0) from analytics_live_hours('10000000-0000-4000-8000-0000000000f1', 48)) <> 0 then
    raise exception 'another team''s sums are empty for a non-member (RLS)';
  end if;
  begin
    insert into analytics_live (team_id, platform, external_id, at, views) values ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v9', now(), 1);
    raise exception 'analytics_live writable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
  begin
    perform analytics_live_fanout();
    raise exception 'analytics_live_fanout() callable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
  begin
    perform analytics_reach_totals('10000000-0000-4000-8000-0000000000e1');
    raise exception 'analytics_reach_totals() callable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
commit;

-- 4. Impressions and CTR per video over the days kept: CTR weighted by impressions.
insert into analytics_content (team_id, platform, external_id, views) values
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', 190),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v3', 10)
on conflict do nothing;
insert into analytics_content_days (team_id, platform, external_id, day, source, impressions, ctr) values
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', current_date - 3, 'daily', 1000, 5.00),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v1', current_date - 2, 'daily', 3000, 9.00),
  ('10000000-0000-4000-8000-0000000000e1', 'youtube', 'v3', current_date - 2, 'daily', null, null);
do $$
declare
  n int := analytics_reach_totals('10000000-0000-4000-8000-0000000000e1');
  c record;
begin
  select impressions, ctr into c from analytics_content where team_id = '10000000-0000-4000-8000-0000000000e1' and external_id = 'v1';
  if c.impressions <> 4000 or c.ctr <> 8.00 then
    raise exception 'analytics_reach_totals: 4000 impressions at 8%% (got %, %)', c.impressions, c.ctr;
  end if;
  if (select impressions from analytics_content where team_id = '10000000-0000-4000-8000-0000000000e1' and external_id = 'v3') is not null then
    raise exception 'analytics_reach_totals: a video without impressions keeps none';
  end if;
  if n <> 1 then
    raise exception 'analytics_reach_totals: one video updated (got %)', n;
  end if;
end $$;

-- Clean up what other checks might count.
delete from analytics_live where team_id in ('10000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000f1');
delete from analytics_content_days where team_id = '10000000-0000-4000-8000-0000000000e1';
delete from analytics_content where team_id = '10000000-0000-4000-8000-0000000000e1';
delete from social_accounts where team_id in ('10000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000f1');
delete from vault.secrets where name in ('posting_url', 'cron_secret');
