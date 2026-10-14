-- ============================================================================
-- 0084: the new Analytics pages (1.20.0)
--
--   * analytics_top_content(team, from, to, limit, platforms): what each
--     video got in a range of days, biggest first (the Overview's "Top
--     content in this period"). YouTube: its own per-day views (each day's
--     top 50 the morning copy keeps, and the whole history of videos whose
--     page asked for it). Instagram, TikTok and Facebook only share running
--     totals: the last copy up to the morning after the range minus the
--     first copy of the range (a video posted in the range starts from 0).
--   * analytics_live_buckets(team, minutes, step): views, likes and comments
--     per `step`-minute slot over the last `minutes` (the slots end now, so
--     they add up to the same as analytics_live_gains for those minutes),
--     from the 10-minute counts (0083), a change spread over the time it
--     happened in. The Realtime tab's last 60 minutes in 10-minute bars.
-- Both run with the reader's own rights (RLS: their teams only). Nothing is
-- written. Staging first, then production. Safe to run more than once.
-- ============================================================================

create or replace function analytics_top_content(
  p_team uuid,
  p_from date,
  p_to date,
  p_limit int default 10,
  p_platforms text[] default null
)
returns table (platform text, external_id text, views bigint, from_totals boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with lim as (
    select least(p_from, p_to) as a,
           greatest(p_from, p_to) as b,
           least(greatest(coalesce(p_limit, 10), 1), 100) as n
  ),
  daily as (
    select d.platform, d.external_id, sum(coalesce(d.views, 0))::bigint as views
      from analytics_content_days d, lim
     where d.team_id = p_team
       and d.source = 'daily'
       and d.day between lim.a and lim.b
       and (p_platforms is null or d.platform = any (p_platforms))
     group by d.platform, d.external_id
  ),
  totals as (
    select d.platform, d.external_id, d.day, d.views
      from analytics_content_days d, lim
     where d.team_id = p_team
       and d.source = 'total'
       and d.views is not null
       and d.day between lim.a and lim.b + 1
       and (p_platforms is null or d.platform = any (p_platforms))
  ),
  last_seen as (
    select distinct on (t.platform, t.external_id) t.platform, t.external_id, t.views
      from totals t
     order by t.platform, t.external_id, t.day desc
  ),
  first_seen as (
    select distinct on (t.platform, t.external_id) t.platform, t.external_id, t.views
      from totals t
     order by t.platform, t.external_id, t.day asc
  ),
  gains as (
    select l.platform, l.external_id,
           greatest(
             l.views - case when c.published_at is not null and c.published_at >= (select a from lim)::timestamptz then 0 else f.views end,
             0
           )::bigint as views
      from last_seen l
      join first_seen f on f.platform = l.platform and f.external_id = l.external_id
      left join analytics_content c on c.team_id = p_team and c.platform = l.platform and c.external_id = l.external_id
  )
  select x.platform, x.external_id, x.views, x.from_totals
    from (
      select platform, external_id, views, false as from_totals from daily
      union all
      select platform, external_id, views, true from gains
    ) x
   where x.views > 0
   order by x.views desc, x.platform, x.external_id
   limit (select n from lim);
$$;
revoke all on function analytics_top_content(uuid, date, date, int, text[]) from public, anon;
grant execute on function analytics_top_content(uuid, date, date, int, text[]) to authenticated, service_role;

create or replace function analytics_live_buckets(p_team uuid, p_minutes int default 60, p_step int default 10)
returns table (at timestamptz, platform text, views bigint, likes bigint, comments bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with st as (
    select least(greatest(coalesce(p_step, 10), 1), 60) as step
  ),
  b as (
    select st.step,
           make_interval(mins => st.step) as width,
           st.step * 60 as secs,
           -- The slots end now (the last one is the last `step` minutes); at most two days of them.
           now() - make_interval(mins => least(greatest(ceil(coalesce(p_minutes, 60)::numeric / st.step)::int, 1), 2880 / st.step) * st.step) as first
      from st
  ),
  s as (
    select l.platform, l.at, l.views, l.likes, l.comments,
           lag(l.at) over w as pat, lag(l.views) over w as pv, lag(l.likes) over w as pl, lag(l.comments) over w as pc
      from analytics_live l, b
     where l.team_id = p_team
       and l.at > b.first - interval '12 hours'
    window w as (partition by l.platform, l.external_id order by l.at)
  ),
  d as (
    select s.platform, greatest(s.pat, b.first) as a, s.at as e,
           extract(epoch from (s.at - s.pat)) as span,
           greatest(coalesce(s.views - s.pv, 0), 0) as dv,
           greatest(coalesce(s.likes - s.pl, 0), 0) as dl,
           greatest(coalesce(s.comments - s.pc, 0), 0) as dc
      from s, b
     where s.pat is not null and s.at > b.first and s.at > s.pat
  )
  select g.slot, d.platform,
         round(sum(d.dv * g.f))::bigint, round(sum(d.dl * g.f))::bigint, round(sum(d.dc * g.f))::bigint
    from d
    cross join b
    cross join lateral (
      select x as slot,
             extract(epoch from (least(x + b.width, d.e) - greatest(x, d.a))) / nullif(d.span, 0) as f
        from generate_series(
               b.first + make_interval(secs => floor(extract(epoch from (d.a - b.first)) / b.secs) * b.secs),
               d.e,
               b.width
             ) x
    ) g
   where g.f > 0
   group by g.slot, d.platform
   order by g.slot, d.platform;
$$;
revoke all on function analytics_live_buckets(uuid, int, int) from public, anon;
grant execute on function analytics_live_buckets(uuid, int, int) to authenticated, service_role;
