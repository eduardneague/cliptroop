-- Checks for 0086 (analytics you can trust): live streams are their own kind
-- and YouTube's own word decides it; what each video got in a stretch of days
-- (YouTube's days added up, the others' running totals' change, a video
-- posted in the stretch from 0) and between two moments; per hour with
-- shares; each account's totals kept 8 days and read by teammates only; a
-- missed morning copy started once, from the database. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a6', 'acc-a@example.com'),
  ('00000000-0000-4000-8000-0000000000b6', 'acc-b@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000a6', 'acc-a@example.com'),
  ('00000000-0000-4000-8000-0000000000b6', 'acc-b@example.com')
on conflict do nothing;
-- (Creating a team makes its owner a master member.)
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000000a6', 'Team A6', 'accuracy-team-a', '00000000-0000-4000-8000-0000000000a6'),
  ('10000000-0000-4000-8000-0000000000b6', 'Team B6', 'accuracy-team-b', '00000000-0000-4000-8000-0000000000b6');
insert into social_accounts (team_id, platform, external_id, access_token_enc, status) values
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'UCA6', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'TTA6', 'v1:x', 'active')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Live streams: their own kind, and YouTube's word for a video decides it.
insert into analytics_content (team_id, platform, external_id, kind, content_type, title, published_at) values
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'live1', 'long', 'LIVE_STREAM', 'A stream', now() - interval '20 days'),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'short1', 'long', 'SHORTS', 'A short', now() - interval '20 days'),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', 'short', 'VIDEO_ON_DEMAND', 'A video', now() - interval '20 days'),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'guess', 'short', null, 'Guessed', now() - interval '20 days'),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', 'short', 'LIVE_STREAM', 'Not YouTube', now() - interval '20 days'),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt2', 'short', null, 'Posted in the stretch', (current_date - 5)::timestamptz + interval '10 hours');
do $$
declare
  k text;
begin
  if (select kind from analytics_content where external_id = 'live1') <> 'live' then raise exception 'a LIVE_STREAM is a live stream'; end if;
  if (select kind from analytics_content where external_id = 'short1') <> 'short' then raise exception 'SHORTS is a short, whatever the copy guessed'; end if;
  if (select kind from analytics_content where external_id = 'vod1') <> 'long' then raise exception 'VIDEO_ON_DEMAND is a long video'; end if;
  if (select kind from analytics_content where external_id = 'guess') <> 'short' then raise exception 'without YouTube''s word, the guess stays'; end if;
  if (select kind from analytics_content where external_id = 'tt1') <> 'short' then raise exception 'only YouTube''s word counts'; end if;
  update analytics_content set content_type = 'LIVE_STREAM' where external_id = 'guess';
  select kind into k from analytics_content where external_id = 'guess';
  if k <> 'live' then raise exception 'on an update too (got %)', k; end if;
  -- Days and money can be live streams' own.
  insert into analytics_daily (team_id, platform, day, content, views) values ('10000000-0000-4000-8000-0000000000a6', 'youtube', current_date - 2, 'live', 7);
  insert into analytics_revenue_daily (team_id, platform, day, content, revenue, currency) values ('10000000-0000-4000-8000-0000000000a6', 'youtube', current_date - 2, 'live', 1.5, 'EUR');
  begin
    insert into analytics_daily (team_id, platform, day, content, views) values ('10000000-0000-4000-8000-0000000000a6', 'youtube', current_date - 2, 'stories', 1);
    raise exception 'analytics_daily accepts only all, shorts, long and live';
  exception when check_violation then null;
  end;
  begin
    update analytics_syncs set money_currency = 'eur' where team_id = '10000000-0000-4000-8000-0000000000a6';
    insert into analytics_syncs (team_id, platform, money_currency) values ('10000000-0000-4000-8000-0000000000b6', 'youtube', 'eur');
    raise exception 'money_currency is a currency code';
  exception when check_violation then null;
  end;
  if not exists (select 1 from information_schema.columns where table_name = 'analytics_content' and column_name = 'days_filled_at')
     or not exists (select 1 from information_schema.columns where table_name = 'analytics_content_days' and column_name = 'subscribers_lost')
     or not exists (select 1 from information_schema.columns where table_name = 'analytics_syncs' and column_name = 'live_since') then
    raise exception '0086''s new columns are there';
  end if;
end $$;

-- 2. What each video got in a stretch of days (the 5th and 4th day ago).
insert into analytics_content_days (team_id, platform, external_id, day, source, views, watch_minutes, likes, comments, shares, subscribers_gained, subscribers_lost, impressions, ctr) values
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', current_date - 6, 'daily', 5000, 1, 1, 1, 1, 50, 0, 10, 1),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', current_date - 5, 'daily', 100, 50, 5, 1, 0, 3, 1, 1000, 5),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', current_date - 4, 'daily', 200, 80, 7, 2, 1, 4, 0, 3000, 9),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', current_date - 3, 'daily', 999, 1, 1, 1, 1, 9, 0, 10, 1),
  -- TikTok's running totals: the copy on the first day of the stretch, and the morning after it.
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', current_date - 6, 'total', 400, null, 10, 1, 0, null, null, null, null),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', current_date - 5, 'total', 1000, null, 50, 5, 2, null, null, null, null),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', current_date - 3, 'total', 1500, null, 80, 6, 4, null, null, null, null),
  -- Posted in the stretch: from 0.
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt2', current_date - 4, 'total', 300, null, 3, 0, 0, null, null, null, null),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt2', current_date - 3, 'total', 420, null, 4, 0, 0, null, null, null, null);

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a6');
set local role authenticated;
do $$
declare
  r record;
  ids text[];
begin
  select array_agg(t.external_id order by t.ord) into ids
    from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'views') with ordinality as t(platform, external_id, views, watch_minutes, likes, comments, shares, subscribers, impressions, clicks, from_totals, ord);
  if ids <> array['tt1', 'tt2', 'vod1'] then
    raise exception 'analytics_period_videos: the most views first (got %)', ids;
  end if;
  select * into r from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'views') where external_id = 'vod1';
  if r.views <> 300 or r.watch_minutes <> 130 or r.likes <> 12 or r.comments <> 3 or r.shares <> 1 or r.impressions <> 4000 or round(r.clicks) <> 320 or r.from_totals then
    raise exception 'analytics_period_videos: YouTube''s own days added up (got %)', r;
  end if;
  if r.subscribers <> 6 then
    raise exception 'analytics_period_videos: subscribers gained minus lost (got %)', r.subscribers;
  end if;
  select * into r from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'views') where external_id = 'tt1';
  if r.views <> 500 or r.likes <> 30 or r.comments <> 1 or r.shares <> 2 or not r.from_totals then
    raise exception 'analytics_period_videos: the change in the running totals over the stretch (got %)', r;
  end if;
  if (select views from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'views') where external_id = 'tt2') <> 420 then
    raise exception 'analytics_period_videos: a video posted in the stretch counts from 0';
  end if;
  if (select external_id from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'followers') limit 1) <> 'vod1' then
    raise exception 'analytics_period_videos: sorted by the number picked';
  end if;
  if (select count(*) from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, array['youtube'], 'views')) <> 1 then
    raise exception 'analytics_period_videos: only the platforms asked for';
  end if;
  if (select count(*) from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 1, null, 'views')) <> 1 then
    raise exception 'analytics_period_videos: at most the limit';
  end if;
end $$;
reset role;
commit;

-- Another team's member gets nothing (RLS: the function runs with their rights).
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
do $$
begin
  if (select count(*) from analytics_period_videos('10000000-0000-4000-8000-0000000000a6', current_date - 5, current_date - 4, 10, null, 'views')) <> 0 then
    raise exception 'analytics_period_videos: another team''s videos stay hidden';
  end if;
end $$;
reset role;
commit;

-- 3. Between two moments, and per hour with shares (the 10-minute counts).
insert into analytics_live (team_id, platform, external_id, at, views, likes, comments, shares) values
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', date_trunc('hour', now()) - interval '3 hours', 100, 10, 1, null),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', 'vod1', date_trunc('hour', now()) - interval '2 hours', 160, 14, 1, null),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', date_trunc('hour', now()) - interval '3 hours', 1000, 50, 5, 10),
  ('10000000-0000-4000-8000-0000000000a6', 'tiktok', 'tt1', date_trunc('hour', now()) - interval '2 hours', 1100, 60, 5, 16);
-- Each account's totals: one from 9 days ago (dropped by the timer), two recent.
insert into analytics_live_totals (team_id, platform, at, followers, total_views, videos) values
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', now() - interval '9 days', 100, 1000, 3),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', now() - interval '1 hour', 120, 5000, 4),
  ('10000000-0000-4000-8000-0000000000a6', 'youtube', now() - interval '10 minutes', 121, 5100, 4);

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a6');
set local role authenticated;
do $$
declare
  v bigint;
  r record;
begin
  -- Half of the hour between the two reads: half of the 60 gained.
  select views into v from analytics_live_window('10000000-0000-4000-8000-0000000000a6', date_trunc('hour', now()) - interval '150 minutes', date_trunc('hour', now()) - interval '2 hours') where external_id = 'vod1';
  if v <> 30 then
    raise exception 'analytics_live_window: a change spread over the time between two reads (got %)', v;
  end if;
  select * into r from analytics_live_series('10000000-0000-4000-8000-0000000000a6', 48) where platform = 'tiktok' and hour = date_trunc('hour', now()) - interval '3 hours';
  if r.views <> 100 or r.likes <> 10 or r.shares <> 6 then
    raise exception 'analytics_live_series: the hour''s views, likes and shares (got %)', r;
  end if;
  if (select count(*) from analytics_live_totals) <> 3 then
    raise exception 'analytics_live_totals: a teammate reads their team''s totals (got %)', (select count(*) from analytics_live_totals);
  end if;
  begin
    insert into analytics_live_totals (team_id, platform, at, total_views) values ('10000000-0000-4000-8000-0000000000a6', 'youtube', now(), 1);
    raise exception 'analytics_live_totals writable by a signed-in person';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
commit;

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
do $$
begin
  if (select count(*) from analytics_live_totals) <> 0 then
    raise exception 'analytics_live_totals: another team''s totals stay hidden';
  end if;
  if (select count(*) from analytics_live_window('10000000-0000-4000-8000-0000000000a6', now() - interval '1 day', now())) <> 0 then
    raise exception 'analytics_live_window: another team''s counts stay hidden';
  end if;
end $$;
reset role;
commit;

do $$
begin
  perform analytics_live_fanout();
  if exists (select 1 from analytics_live_totals where team_id = '10000000-0000-4000-8000-0000000000a6' and at < now() - interval '8 days') then
    raise exception 'analytics_live_fanout: totals older than 8 days are dropped';
  end if;
  if (select count(*) from analytics_live_totals where team_id = '10000000-0000-4000-8000-0000000000a6') <> 2 then
    raise exception 'analytics_live_fanout: the recent totals stay';
  end if;
end $$;

-- 4. A missed morning copy: started from the database, once, for the platforms not copied for 30 hours.
delete from vault.secrets where name in ('posting_url', 'cron_secret');
insert into analytics_syncs (team_id, platform, last_run_at) values ('10000000-0000-4000-8000-0000000000a6', 'youtube', now() - interval '2 hours')
on conflict (team_id, platform) do update set last_run_at = excluded.last_run_at;
delete from analytics_syncs where team_id = '10000000-0000-4000-8000-0000000000a6' and platform = 'tiktok';

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
do $$
begin
  perform analytics_catch_up('10000000-0000-4000-8000-0000000000a6');
  raise exception 'analytics_catch_up: only the team''s members';
exception when insufficient_privilege then null;
end $$;
reset role;
commit;

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a6');
set local role authenticated;
do $$
begin
  if analytics_catch_up('10000000-0000-4000-8000-0000000000a6') <> -1 then
    raise exception 'analytics_catch_up: -1 without a timer to call (the page copies them itself then)';
  end if;
end $$;
reset role;
commit;

select vault.create_secret('https://app.example.com/api/cron/posting', 'posting_url');
select vault.create_secret('0123456789abcdef0123456789abcdef', 'cron_secret');
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a6');
set local role authenticated;
do $$
declare
  n int;
begin
  n := analytics_catch_up('10000000-0000-4000-8000-0000000000a6');
  if n <> 1 then
    raise exception 'analytics_catch_up: one call, for TikTok (YouTube was copied 2 hours ago), got %', n;
  end if;
  if analytics_catch_up('10000000-0000-4000-8000-0000000000a6') <> 0 then
    raise exception 'analytics_catch_up: claimed, so the next visitor doesn''t start it again';
  end if;
end $$;
reset role;
commit;
do $$
begin
  if not exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%"job": "analytics"%' and convert_from(body, 'utf8') like '%"platform": "tiktok"%' and convert_from(body, 'utf8') like '%10000000-0000-4000-8000-0000000000a6%') then
    raise exception 'analytics_catch_up: the call is the analytics job for that team and platform';
  end if;
end $$;

-- Clean up what other checks might count.
delete from vault.secrets where name in ('posting_url', 'cron_secret');
delete from analytics_live where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_live_totals where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_content_days where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_content where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_daily where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_revenue_daily where team_id = '10000000-0000-4000-8000-0000000000a6';
delete from analytics_syncs where team_id in ('10000000-0000-4000-8000-0000000000a6', '10000000-0000-4000-8000-0000000000b6');
delete from social_accounts where team_id = '10000000-0000-4000-8000-0000000000a6';
