-- ============================================================================
-- 0083: every video, numbers within minutes, impressions and CTR (1.19.0)
--
--   * analytics_live: each video's public counts (views, likes, comments,
--     shares) every time the 10-minute job sees them change. The changes
--     are Analytics' realtime: views per hour over the last 48 hours, the
--     last 60 minutes, the videos getting views right now. Kept 8 days.
--   * analytics_live_hours() / analytics_live_gains(): those sums, per hour
--     and per video (a change between two looks is spread evenly over the
--     time between them). Read with the person's own rights (RLS).
--   * analytics_live_fanout(): the timer (every 10 minutes, at :05, :15…)
--     sends one call per team and platform, each with its own time in the
--     app, like the morning copy (0082); it also drops counts older than
--     8 days.
--   * Impressions and click-through rate, from YouTube's Reporting API
--     ("reach" reports): per video and day (analytics_content_days), per
--     day (analytics_daily) and per video over the days kept
--     (analytics_content, analytics_reach_totals()).
--   * analytics_content.live_at / details_at: when a video's counts and its
--     other numbers were last refreshed. analytics_syncs: the live job's and
--     the reach reports' progress and notes, where a long list stopped
--     (live_cursor), and the account's totals now (live_totals: followers,
--     all-time views…; the per-day rows stay the morning copy's).
--   * After 48 hours, a video's counts are thinned to the last one of each
--     hour (the sums per hour stay the same).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

-- 1. Impressions and CTR (CTR in %, like average % viewed) -----------------------
alter table analytics_content add column if not exists impressions bigint;
alter table analytics_content add column if not exists ctr numeric(6, 2);
alter table analytics_content add column if not exists live_at timestamptz;
alter table analytics_content add column if not exists details_at timestamptz;
alter table analytics_content_days add column if not exists impressions bigint;
alter table analytics_content_days add column if not exists ctr numeric(6, 2);
alter table analytics_daily add column if not exists impressions bigint;
alter table analytics_daily add column if not exists ctr numeric(6, 2);

-- 2. Progress of the live job and of the reach reports, per team and platform -----
alter table analytics_syncs add column if not exists live_at timestamptz;
alter table analytics_syncs add column if not exists live_full_at timestamptz;
alter table analytics_syncs add column if not exists live_error text;
alter table analytics_syncs add column if not exists live_cursor text;
alter table analytics_syncs add column if not exists live_totals jsonb;
alter table analytics_syncs add column if not exists reach_job text;
alter table analytics_syncs add column if not exists reach_after timestamptz;
alter table analytics_syncs add column if not exists reach_checked_at timestamptz;
alter table analytics_syncs add column if not exists reach_note text;
alter table analytics_syncs drop constraint if exists analytics_syncs_live_error_check;
alter table analytics_syncs add constraint analytics_syncs_live_error_check check (live_error is null or char_length(live_error) <= 500);
alter table analytics_syncs drop constraint if exists analytics_syncs_live_cursor_check;
alter table analytics_syncs add constraint analytics_syncs_live_cursor_check check (live_cursor is null or char_length(live_cursor) <= 2000);
alter table analytics_syncs drop constraint if exists analytics_syncs_live_totals_check;
alter table analytics_syncs add constraint analytics_syncs_live_totals_check check (live_totals is null or (jsonb_typeof(live_totals) = 'object' and pg_column_size(live_totals) <= 2000));
alter table analytics_syncs drop constraint if exists analytics_syncs_reach_job_check;
alter table analytics_syncs add constraint analytics_syncs_reach_job_check check (reach_job is null or char_length(reach_job) <= 200);
alter table analytics_syncs drop constraint if exists analytics_syncs_reach_note_check;
alter table analytics_syncs add constraint analytics_syncs_reach_note_check check (reach_note is null or char_length(reach_note) <= 500);

-- 3. The live counts -----------------------------------------------------------------
create table if not exists analytics_live (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  external_id text not null check (char_length(external_id) <= 200),
  at timestamptz not null,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  primary key (team_id, platform, external_id, at)
);
create index if not exists analytics_live_team_at_idx on analytics_live (team_id, at);
create index if not exists analytics_live_at_idx on analytics_live (at);

alter table analytics_live enable row level security;
revoke all on analytics_live from anon, authenticated;
grant select on analytics_live to authenticated;
drop policy if exists "team reads analytics_live" on analytics_live;
create policy "team reads analytics_live" on analytics_live for select to authenticated
  using (team_id in (select my_team_ids()));

-- Views, likes and comments gained per hour over the last p_hours (≤ 8 days),
-- per platform. Each change between two looks at a video is spread over the
-- hours between them, so a video seen every few hours adds evenly instead of
-- in one spike. With the caller's rights: teammates only (RLS).
create or replace function analytics_live_hours(p_team uuid, p_hours int default 48)
returns table (hour timestamptz, platform text, views bigint, likes bigint, comments bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select now() - make_interval(hours => least(greatest(coalesce(p_hours, 48), 1), 192)) as since
  ),
  s as (
    select l.platform, l.at, l.views, l.likes, l.comments,
           lag(l.at) over w as pat, lag(l.views) over w as pv, lag(l.likes) over w as pl, lag(l.comments) over w as pc
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
           greatest(coalesce(s.comments - s.pc, 0), 0) as dc
      from s, lim
     where s.pat is not null and s.at > lim.since and s.at > s.pat
  )
  select h.hour, d.platform,
         round(sum(d.dv * h.f))::bigint, round(sum(d.dl * h.f))::bigint, round(sum(d.dc * h.f))::bigint
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
revoke all on function analytics_live_hours(uuid, int) from public, anon;
grant execute on function analytics_live_hours(uuid, int) to authenticated, service_role;

-- What each video gained in the last p_minutes (≤ 8 days): the realtime
-- card's top videos, the last 60 minutes, the videos to look at often.
create or replace function analytics_live_gains(p_team uuid, p_minutes int default 2880)
returns table (platform text, external_id text, views bigint, likes bigint, comments bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select now() - make_interval(mins => least(greatest(coalesce(p_minutes, 2880), 1), 11520)) as since
  ),
  s as (
    select l.platform, l.external_id, l.at, l.views, l.likes, l.comments,
           lag(l.at) over w as pat, lag(l.views) over w as pv, lag(l.likes) over w as pl, lag(l.comments) over w as pc
      from analytics_live l, lim
     where l.team_id = p_team
       and l.at > lim.since - interval '12 hours'
    window w as (partition by l.platform, l.external_id order by l.at)
  )
  select s.platform, s.external_id,
         round(sum(greatest(coalesce(s.views - s.pv, 0), 0) * f.f))::bigint,
         round(sum(greatest(coalesce(s.likes - s.pl, 0), 0) * f.f))::bigint,
         round(sum(greatest(coalesce(s.comments - s.pc, 0), 0) * f.f))::bigint
    from s, lim,
         lateral (select extract(epoch from (s.at - greatest(s.pat, lim.since))) / nullif(extract(epoch from (s.at - s.pat)), 0) as f) f
   where s.pat is not null and s.at > lim.since and s.at > s.pat
   group by s.platform, s.external_id;
$$;
revoke all on function analytics_live_gains(uuid, int) from public, anon;
grant execute on function analytics_live_gains(uuid, int) to authenticated, service_role;

-- 4. The 10-minute timer: one call per team and platform, then old counts go
--    (older than 8 days), and counts older than 48 hours are thinned to the
--    last one of each hour per video (the hours just past 48 hours, so each
--    run has little to do; a timer that missed a few runs catches up).
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

select cron.schedule('vplanner-live', '5-59/10 * * * *', $$ select analytics_live_fanout(); $$);

-- 5. Each video's impressions and CTR over the days kept (server only) --------------
create or replace function analytics_reach_totals(p_team uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  update analytics_content c
     set impressions = t.impressions,
         ctr = t.ctr
    from (
      select external_id,
             sum(impressions)::bigint as impressions,
             case when sum(impressions) > 0
                  then round((sum(impressions * coalesce(ctr, 0)) / sum(impressions))::numeric, 2)
             end as ctr
        from analytics_content_days
       where team_id = p_team and platform = 'youtube' and impressions is not null
       group by external_id
    ) t
   where c.team_id = p_team and c.platform = 'youtube' and c.external_id = t.external_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function analytics_reach_totals(uuid) from public, anon, authenticated;
grant execute on function analytics_reach_totals(uuid) to service_role;

-- 6. Realtime: the live counts reach open pages (Analytics refreshes itself).
do $$
begin
  begin
    alter publication supabase_realtime add table analytics_syncs;
  exception when others then null;
  end;
end $$;
