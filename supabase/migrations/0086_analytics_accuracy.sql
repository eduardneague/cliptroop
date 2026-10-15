-- ============================================================================
-- 0086: analytics you can trust (1.22.0)
--
--   * Live streams are their own kind: analytics_content.kind 'live', and
--     'live' next to 'shorts' and 'long' in analytics_daily and
--     analytics_revenue_daily (YouTube's creatorContentType LIVE_STREAM used
--     to count as a long video). analytics_content.content_type keeps what
--     YouTube itself calls each video (SHORTS, VIDEO_ON_DEMAND, LIVE_STREAM…);
--     when it's known, a trigger sets the kind from it, so a premiere is a
--     long video and a stream's recording is a live stream whatever the
--     other parts of the copy guessed.
--   * analytics_live_totals: each account's totals (followers, all-time
--     views, videos) every time the 10-minute job reads them, kept 8 days.
--     Realtime fills the hours before every video was counted from the
--     channel's own total views, and the 48 hours get followers per hour.
--   * analytics_syncs.live_since: since when every video is counted (the
--     first complete pass over all of them). Before it, a video's views
--     weren't all seen, so those hours are worked out from the totals.
--     Filled for the counts kept so far (when 80% of the videos had been
--     seen).
--   * analytics_content_days.subscribers_lost: a video's subscribers per day
--     net (gained minus lost), like YouTube Studio's "Subscribers".
--   * analytics_content.days_filled_at: when a video's whole day-by-day
--     history was asked from YouTube (its page asked again on every visit
--     when YouTube had nothing for its first days).
--   * analytics_syncs.money_currency: the currency YouTube's revenue is
--     asked in (the team owner's), so it matches YouTube Studio to the
--     cent. Another currency there makes the copy fetch the money again.
--   * YouTube's stored days are fetched again (history from a week ago back
--     to the channel's first day), so live streams come apart from long
--     videos on every day, not just the new ones.
--   * analytics_period_videos(team, from, to, limit, platforms, metric):
--     what each video got in a stretch of days (views, watch time, likes,
--     comments, shares, subscribers, impressions and clicks), the biggest
--     first by the chosen number: a day, week or month clicked on a chart.
--   * analytics_live_window(team, from, to): what each video got between two
--     moments, from the 10-minute counts (an hour clicked on the 48 hours).
--   * analytics_live_series(team, hours): views, likes, comments and shares
--     per hour per platform (analytics_live_hours with shares).
--   * analytics_catch_up(team): a missed morning copy is started from the
--     database, one call per platform, claimed so only one visitor starts it
--     (it used to run inside the page's request, and a copy cut off there was
--     started again by the next visitor).
-- Read with the person's own rights (RLS: their teams only). Staging first,
-- then production. Safe to run more than once.
-- ============================================================================

-- 1. Live streams: a kind of their own ------------------------------------------------
alter table analytics_content drop constraint if exists analytics_content_kind_check;
alter table analytics_content add constraint analytics_content_kind_check check (kind in ('short', 'long', 'live', 'post'));
alter table analytics_daily drop constraint if exists analytics_daily_content_check;
alter table analytics_daily add constraint analytics_daily_content_check check (content in ('all', 'shorts', 'long', 'live'));
alter table analytics_revenue_daily drop constraint if exists analytics_revenue_daily_content_check;
alter table analytics_revenue_daily add constraint analytics_revenue_daily_content_check check (content in ('all', 'shorts', 'long', 'live'));

alter table analytics_content add column if not exists content_type text;
alter table analytics_content drop constraint if exists analytics_content_content_type_check;
alter table analytics_content add constraint analytics_content_content_type_check check (content_type is null or content_type ~ '^[A-Z_]{1,40}$');

-- YouTube says what each video is: when it's known, the kind follows it.
create or replace function analytics_content_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform = 'youtube' and new.content_type is not null then
    new.kind := case new.content_type
      when 'LIVE_STREAM' then 'live'
      when 'SHORTS' then 'short'
      when 'VIDEO_ON_DEMAND' then 'long'
      else new.kind
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists analytics_content_kind on analytics_content;
create trigger analytics_content_kind before insert or update on analytics_content
  for each row execute function analytics_content_kind();

-- 2. Each account's totals over time -------------------------------------------------
create table if not exists analytics_live_totals (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  at timestamptz not null,
  followers bigint,
  total_views bigint,
  videos int,
  primary key (team_id, platform, at)
);
create index if not exists analytics_live_totals_team_at_idx on analytics_live_totals (team_id, at);

alter table analytics_live_totals enable row level security;
revoke all on analytics_live_totals from anon, authenticated;
grant select on analytics_live_totals to authenticated;
drop policy if exists "team reads analytics_live_totals" on analytics_live_totals;
create policy "team reads analytics_live_totals" on analytics_live_totals for select to authenticated
  using (team_id in (select my_team_ids()));

-- 3. Since when every video is counted; the money's currency ---------------------------
alter table analytics_syncs add column if not exists live_since timestamptz;
alter table analytics_syncs add column if not exists money_currency text;
alter table analytics_syncs drop constraint if exists analytics_syncs_money_currency_check;
alter table analytics_syncs add constraint analytics_syncs_money_currency_check check (money_currency is null or money_currency ~ '^[A-Z]{3}$');

-- The counts kept so far: every video counted from when 80% of them had been seen.
update analytics_syncs s
   set live_since = x.at
  from (
    select team_id, platform, min(first_at) filter (where rn >= ceil(0.8 * n)) as at
      from (
        select team_id, platform, first_at,
               row_number() over (partition by team_id, platform order by first_at) as rn,
               count(*) over (partition by team_id, platform) as n
          from (select team_id, platform, external_id, min(at) as first_at from analytics_live group by 1, 2, 3) f
      ) r
     group by 1, 2
  ) x
 where s.team_id = x.team_id and s.platform = x.platform and s.live_since is null and x.at is not null;

-- When a video's day-by-day history was last asked from YouTube: its page asks
-- once, not on every visit (a video YouTube has no first days for kept asking).
alter table analytics_content add column if not exists days_filled_at timestamptz;
-- Subscribers lost per day too: a video's subscribers net, like YouTube Studio's.
alter table analytics_content_days add column if not exists subscribers_lost int;

-- 4. Live streams apart on the days already stored: YouTube's days are fetched
--    again, from a week ago (the morning copy keeps the last week) back to the
--    channel's first day. Only where a copy has run (the others start from scratch).
update analytics_syncs
   set history_from = (now() at time zone 'utc')::date - 6,
       history_done = false
 where platform = 'youtube'
   and last_ok_at is not null
   and (history_from is null or history_from > (now() at time zone 'utc')::date - 6 or history_done);

-- 5. What each video got in a stretch of days -------------------------------------------
-- YouTube: its own per-day numbers (each day's top 50 the morning copy keeps,
-- every day of the videos whose page asked for them, impressions from the
-- reach reports). Instagram, TikTok and Facebook: the change in their running
-- totals between the first copy of the stretch and the morning after it (a
-- video posted in it starts from 0).
create or replace function analytics_period_videos(
  p_team uuid,
  p_from date,
  p_to date,
  p_limit int default 50,
  p_platforms text[] default null,
  p_metric text default 'views'
)
returns table (
  platform text,
  external_id text,
  views bigint,
  watch_minutes numeric,
  likes bigint,
  comments bigint,
  shares bigint,
  subscribers bigint,
  impressions bigint,
  clicks numeric,
  from_totals boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select least(p_from, p_to) as a,
           greatest(p_from, p_to) as b,
           least(greatest(coalesce(p_limit, 50), 1), 500) as n
  ),
  daily as (
    select d.platform, d.external_id,
           sum(d.views)::bigint as views,
           sum(d.watch_minutes) as watch_minutes,
           sum(d.likes)::bigint as likes,
           sum(d.comments)::bigint as comments,
           sum(d.shares)::bigint as shares,
           -- Net, like YouTube Studio's (subscribers lost per day from this migration on).
           (sum(d.subscribers_gained) - coalesce(sum(d.subscribers_lost), 0))::bigint as subscribers,
           sum(d.impressions)::bigint as impressions,
           sum(d.impressions * coalesce(d.ctr, 0) / 100.0) as clicks
      from analytics_content_days d, lim
     where d.team_id = p_team
       and d.source = 'daily'
       and d.day between lim.a and lim.b
       and (p_platforms is null or d.platform = any (p_platforms))
     group by d.platform, d.external_id
  ),
  totals as (
    select d.platform, d.external_id, d.day, d.views, d.likes, d.comments, d.shares
      from analytics_content_days d, lim
     where d.team_id = p_team
       and d.source = 'total'
       and d.views is not null
       and d.day between lim.a and lim.b + 1
       and (p_platforms is null or d.platform = any (p_platforms))
  ),
  last_seen as (
    select distinct on (t.platform, t.external_id) t.*
      from totals t
     order by t.platform, t.external_id, t.day desc
  ),
  first_seen as (
    select distinct on (t.platform, t.external_id) t.*
      from totals t
     order by t.platform, t.external_id, t.day asc
  ),
  gains as (
    select l.platform, l.external_id,
           greatest(l.views - case when fresh then 0 else f.views end, 0)::bigint as views,
           null::numeric as watch_minutes,
           greatest(coalesce(l.likes, 0) - case when fresh then 0 else coalesce(f.likes, 0) end, 0)::bigint as likes,
           greatest(coalesce(l.comments, 0) - case when fresh then 0 else coalesce(f.comments, 0) end, 0)::bigint as comments,
           greatest(coalesce(l.shares, 0) - case when fresh then 0 else coalesce(f.shares, 0) end, 0)::bigint as shares,
           null::bigint as subscribers,
           null::bigint as impressions,
           null::numeric as clicks
      from last_seen l
      join first_seen f on f.platform = l.platform and f.external_id = l.external_id
      left join analytics_content c on c.team_id = p_team and c.platform = l.platform and c.external_id = l.external_id
      cross join lateral (select c.published_at is not null and c.published_at >= (select a from lim)::timestamptz as fresh) x
  ),
  everything as (
    select d.*, false as from_totals from daily d
    union all
    select g.*, true from gains g
  )
  select e.platform, e.external_id, e.views, e.watch_minutes, e.likes, e.comments, e.shares, e.subscribers, e.impressions, e.clicks, e.from_totals
    from everything e
   where coalesce(e.views, 0) > 0 or coalesce(e.impressions, 0) > 0 or coalesce(e.subscribers, 0) <> 0
   order by
     case coalesce(p_metric, 'views')
       when 'watch' then coalesce(e.watch_minutes, 0)
       when 'likes' then coalesce(e.likes, 0)
       when 'comments' then coalesce(e.comments, 0)
       when 'shares' then coalesce(e.shares, 0)
       when 'engagement' then coalesce(e.likes, 0) + coalesce(e.comments, 0) + coalesce(e.shares, 0)
       when 'followers' then coalesce(e.subscribers, 0)
       when 'impressions' then coalesce(e.impressions, 0)
       when 'ctr' then coalesce(e.impressions, 0)
       else coalesce(e.views, 0)
     end desc,
     coalesce(e.views, 0) desc, e.platform, e.external_id
   limit (select n from lim);
$$;
revoke all on function analytics_period_videos(uuid, date, date, int, text[], text) from public, anon;
grant execute on function analytics_period_videos(uuid, date, date, int, text[], text) to authenticated, service_role;

-- 6. What each video got between two moments (the 10-minute counts) ---------------
create or replace function analytics_live_window(p_team uuid, p_from timestamptz, p_to timestamptz)
returns table (platform text, external_id text, views bigint, likes bigint, comments bigint, shares bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select least(p_from, p_to) as a,
           -- At most 8 days (what's kept).
           least(greatest(p_from, p_to), least(p_from, p_to) + interval '8 days') as b
  ),
  s as (
    select l.platform, l.external_id, l.at, l.views, l.likes, l.comments, l.shares,
           lag(l.at) over w as pat, lag(l.views) over w as pv, lag(l.likes) over w as pl,
           lag(l.comments) over w as pc, lag(l.shares) over w as ps
      from analytics_live l, lim
     where l.team_id = p_team
       and l.at > lim.a - interval '12 hours'
       and l.at < lim.b + interval '12 hours'
    window w as (partition by l.platform, l.external_id order by l.at)
  ),
  d as (
    select s.platform, s.external_id,
           extract(epoch from (least(s.at, lim.b) - greatest(s.pat, lim.a))) / nullif(extract(epoch from (s.at - s.pat)), 0) as f,
           greatest(coalesce(s.views - s.pv, 0), 0) as dv,
           greatest(coalesce(s.likes - s.pl, 0), 0) as dl,
           greatest(coalesce(s.comments - s.pc, 0), 0) as dc,
           greatest(coalesce(s.shares - s.ps, 0), 0) as ds
      from s, lim
     where s.pat is not null and s.at > s.pat and s.at > lim.a and s.pat < lim.b
  )
  select d.platform, d.external_id,
         round(sum(d.dv * d.f))::bigint, round(sum(d.dl * d.f))::bigint,
         round(sum(d.dc * d.f))::bigint, round(sum(d.ds * d.f))::bigint
    from d
   where d.f > 0
   group by d.platform, d.external_id;
$$;
revoke all on function analytics_live_window(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function analytics_live_window(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- 7. Per hour with shares (TikTok and Facebook have them) -----------------------------
create or replace function analytics_live_series(p_team uuid, p_hours int default 48)
returns table (hour timestamptz, platform text, views bigint, likes bigint, comments bigint, shares bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select now() - make_interval(hours => least(greatest(coalesce(p_hours, 48), 1), 192)) as since
  ),
  s as (
    select l.platform, l.at, l.views, l.likes, l.comments, l.shares,
           lag(l.at) over w as pat, lag(l.views) over w as pv, lag(l.likes) over w as pl,
           lag(l.comments) over w as pc, lag(l.shares) over w as ps
      from analytics_live l, lim
     where l.team_id = p_team
       and l.at > lim.since - interval '12 hours'
    window w as (partition by l.platform, l.external_id order by l.at)
  ),
  d as (
    select s.platform, greatest(s.pat, lim.since) as a, s.at as b,
           extract(epoch from (s.at - s.pat)) as span,
           greatest(coalesce(s.views - s.pv, 0), 0) as dv,
           greatest(coalesce(s.likes - s.pl, 0), 0) as dl,
           greatest(coalesce(s.comments - s.pc, 0), 0) as dc,
           greatest(coalesce(s.shares - s.ps, 0), 0) as ds
      from s, lim
     where s.pat is not null and s.at > lim.since and s.at > s.pat
  )
  select h.hour, d.platform,
         round(sum(d.dv * h.f))::bigint, round(sum(d.dl * h.f))::bigint,
         round(sum(d.dc * h.f))::bigint, round(sum(d.ds * h.f))::bigint
    from d
    cross join lateral (
      select g as hour,
             extract(epoch from (least(g + interval '1 hour', d.b) - greatest(g, d.a))) / nullif(d.span, 0) as f
        from generate_series(date_trunc('hour', d.a), date_trunc('hour', d.b), interval '1 hour') g
    ) h
   where h.f > 0
   group by h.hour, d.platform
   order by h.hour, d.platform;
$$;
revoke all on function analytics_live_series(uuid, int) from public, anon;
grant execute on function analytics_live_series(uuid, int) to authenticated, service_role;

-- 8. The 10-minute timer also drops totals older than 8 days -------------------------
create or replace function analytics_live_fanout()
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
    perform posting_call(jsonb_build_object('job', 'live', 'team', r.team_id, 'platform', r.platform));
    n := n + 1;
  end loop;
  delete from analytics_live where at < now() - interval '8 days';
  delete from analytics_live_totals where at < now() - interval '8 days';
  delete from analytics_live l
   where l.at >= now() - interval '60 hours'
     and l.at < now() - interval '48 hours'
     and exists (
       select 1 from analytics_live m
        where m.team_id = l.team_id and m.platform = l.platform and m.external_id = l.external_id
          and m.at > l.at and m.at < date_trunc('hour', l.at) + interval '1 hour'
     );
  return n;
end;
$$;
revoke all on function analytics_live_fanout() from public, anon, authenticated;

-- 9. The catch-up when a morning copy was missed: claimed in the database,
--    one call per platform (each with its own time, like Sync now), instead of
--    every platform inside the page's own request. Anyone on the team; only
--    platforms not copied for 30 hours; -1 when there's no timer to call
--    (a local copy: the page copies them itself then).
create or replace function analytics_catch_up(p_team uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and status = 'active') then
    raise exception 'Not on this team.' using errcode = '42501';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('posting_url', 'cron_secret')) < 2 then
    return -1;
  end if;
  for r in
    select a.platform
      from (select distinct platform from social_accounts where team_id = p_team and status = 'active' and platform in ('youtube', 'instagram', 'tiktok', 'facebook')) a
      left join analytics_syncs s on s.team_id = p_team and s.platform = a.platform
     where s.last_run_at is null or s.last_run_at < now() - interval '30 hours'
  loop
    -- Whoever gets here first starts it.
    insert into analytics_syncs (team_id, platform, last_run_at)
    values (p_team, r.platform, now())
    on conflict (team_id, platform) do update set last_run_at = excluded.last_run_at
     where analytics_syncs.last_run_at is null or analytics_syncs.last_run_at < now() - interval '30 hours';
    if found then
      if posting_call(jsonb_build_object('job', 'analytics', 'team', p_team, 'platform', r.platform, 'live', true)) is not null then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function analytics_catch_up(uuid) from public, anon;
grant execute on function analytics_catch_up(uuid) to authenticated;

-- New functions are callable right away (PostgREST reads the schema again).
notify pgrst, 'reload schema';
