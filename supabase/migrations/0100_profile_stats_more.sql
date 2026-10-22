-- ============================================================================
-- 0100: More to count on a profile (1.29.6)
--
--   profile_stats (0093) answers everything it did, plus what the new
--   achievements need:
--
--   * streak.dates: also when a 14 and a 100 day streak were first reached
--     (it had 3, 7 and 30);
--   * levels: also when levels 20 and 100 were reached (it had 5, 10, 25, 50);
--   * team_dates: also the 5th team (it had the 2nd and 3rd);
--   * more: { n, at } for
--       early:  steps finished 2 days or more before their date
--               (UTC days, like on time), at the 1st, 10th and 50th;
--       night:  steps finished between midnight and 5 am,
--       dawn:   and between 5 and 8 am, in the team's time zone
--               (teams.timezone; one that can't be read counts as UTC).
--               Sending a video out doesn't count for these two: it can
--               happen on its own (a scheduled post);
--       videos: the videos worked on, dated by the first step finished on
--               each, at the 10th, 25th, 50th and 100th.
--
--   vp_marks(dates, marks): how many, and the date at each mark.
--   vp_safe_tz(name): the name when Postgres knows it, else 'UTC' (checked
--   once per team, not per step).
--
-- Same rules for who may see it as before (yours, or a public profile).
-- Safe to run twice. Staging first, then production.
-- ============================================================================

create or replace function vp_marks(p_at timestamptz[], p_marks int[])
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'n', coalesce(cardinality(p_at), 0),
    'at', coalesce((select jsonb_object_agg(m::text, p_at[m]) from unnest(p_marks) as m where m between 1 and coalesce(cardinality(p_at), 0)), '{}'::jsonb)
  );
$$;

create or replace function vp_safe_tz(p_tz text)
returns text
language plpgsql
stable
as $$
begin
  if p_tz is null or p_tz = '' then
    return 'UTC';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

create or replace function profile_stats(p_user uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  if auth.uid() is null or p_user is null then
    return null;
  end if;
  if p_user <> auth.uid() and coalesce((select public from profile_pages where user_id = p_user), true) is not true then
    return null;
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    return null;
  end if;

  with done as (
    select distinct on (t.kind, t.item_id, t.stage)
           t.kind, t.item_id, t.stage, t.team_id, t.completed_at as at,
           (t.due_date is not null and (t.completed_at at time zone 'UTC')::date <= t.due_date) as on_time,
           (t.due_date is not null) as dated,
           (t.due_date is not null and (t.completed_at at time zone 'UTC')::date <= t.due_date - 2) as early
      from tasks t
     where t.user_id = p_user and t.state = 'done' and t.activated_at is not null and t.completed_at is not null
     order by t.kind, t.item_id, t.stage, t.completed_at
  ), zones as (
    select z.team_id, vp_safe_tz(tm.timezone) as tz
      from (select distinct d.team_id from done d) z
      left join teams tm on tm.id = z.team_id
  ), s as (
    select d.*, vp_task_cat(d.kind, d.stage) as cat,
           vp_task_xp(d.kind, d.stage) + case when d.on_time then round(vp_task_xp(d.kind, d.stage) * 0.25)::int else 0 end as xp,
           extract(hour from d.at at time zone coalesce(zn.tz, 'UTC'))::int as hr
      from done d
      left join zones zn on zn.team_id = d.team_id
  ), o as (
    select s.*,
           sum(s.xp) over w as run_xp,
           row_number() over w as n_all,
           row_number() over (partition by s.cat order by s.at, s.item_id, s.stage) as n_cat,
           row_number() over (partition by s.on_time order by s.at, s.item_id, s.stage) as n_on
      from s
    window w as (order by s.at, s.item_id, s.stage rows between unbounded preceding and current row)
  ), days as (
    select distinct (o.at at time zone 'UTC')::date as d from o
  ), runs as (
    select min(x.d) as s0, max(x.d) as e0, count(*)::int as len
      from (select days.d, days.d - (row_number() over (order by days.d))::int as g from days) x
     group by x.g
  )
  select jsonb_build_object(
    'xp', coalesce((select sum(o.xp) from o), 0),
    'tasks', (select count(*) from o),
    'on_time', (select count(*) from o where o.on_time),
    'dated', (select count(*) from o where o.dated),
    'videos', (select count(distinct o.item_id) from o where o.kind in ('short', 'long')),
    'teams', (select count(distinct o.team_id) from o),
    'first_at', (select min(o.at) from o),
    'last_at', (select max(o.at) from o),
    'by', coalesce((select jsonb_object_agg(c.cat, c.n) from (select o.cat, count(*) as n from o group by o.cat) c), '{}'::jsonb),
    'ranks', coalesce((
      select jsonb_object_agg(q.k, q.r)
        from (
          select 'all' as k, jsonb_object_agg(o.n_all::text, o.at) as r from o where o.n_all in (1, 5, 10, 25, 50, 100, 250, 500, 1000)
          union all
          select o.cat, jsonb_object_agg(o.n_cat::text, o.at) from o where o.n_cat in (1, 5, 10, 25, 50, 100, 250, 500, 1000) group by o.cat
          union all
          select 'ontime', jsonb_object_agg(o.n_on::text, o.at) from o where o.on_time and o.n_on in (1, 5, 10, 25, 50, 100, 250, 500, 1000)
        ) q
       where q.r is not null), '{}'::jsonb),
    'team_dates', coalesce((
      select jsonb_object_agg(t.rn::text, t.first)
        from (select f.first, row_number() over (order by f.first) as rn from (select min(o.at) as first from o group by o.team_id) f) t
       where t.rn in (2, 3, 5)), '{}'::jsonb),
    'levels', coalesce((
      select jsonb_object_agg(l::text, (select min(o.at) from o where o.run_xp >= vp_level_floor(l)))
        from unnest(array[5, 10, 20, 25, 50, 100]) as l
       where exists (select 1 from o where o.run_xp >= vp_level_floor(l))), '{}'::jsonb),
    'streak', jsonb_build_object(
      'best', coalesce((select max(runs.len) from runs), 0),
      'current', coalesce((select runs.len from runs where runs.e0 >= (now() at time zone 'UTC')::date - 1 order by runs.e0 desc limit 1), 0),
      'dates', coalesce((
        select jsonb_object_agg(n::text, (select min(runs.s0 + (n - 1)) from runs where runs.len >= n))
          from unnest(array[3, 7, 14, 30, 100]) as n
         where exists (select 1 from runs where runs.len >= n)), '{}'::jsonb)),
    'days', coalesce((
      select jsonb_object_agg(dd.d::text, dd.n)
        from (select (o.at at time zone 'UTC')::date as d, count(*) as n from o where o.at >= now() - interval '372 days' group by 1) dd), '{}'::jsonb),
    'more', jsonb_build_object(
      'early', vp_marks((select array_agg(o.at order by o.at) from o where o.early), array[1, 10, 50]),
      'night', vp_marks((select array_agg(o.at order by o.at) from o where o.cat <> 'publish' and o.hr between 0 and 4), array[1]),
      'dawn', vp_marks((select array_agg(o.at order by o.at) from o where o.cat <> 'publish' and o.hr between 5 and 7), array[1]),
      'videos', vp_marks((select array_agg(v.first order by v.first) from (select min(o.at) as first from o where o.kind in ('short', 'long') group by o.item_id) v), array[10, 25, 50, 100])
    )
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function profile_stats(uuid) from public, anon;
grant execute on function profile_stats(uuid) to authenticated;
