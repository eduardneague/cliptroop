-- 0129 (1.52.0): the timers, lighter. The owner (Nov 16 2026), before moving to Vercel Pro ($20 of usage a month
-- included): "for those things that use a loit of resources, lets make chgagnges so we can save a lot of rescoures and
-- make sure the 20$ a month is more than enough". Every timer call starts the app on Vercel and is billed (CPU while
-- it works, memory while it waits), and most of them had nothing new to do. Each Supabase project (staging and
-- production) runs its own timers against its own copy of the app, so both count.
--
--   * vplanner-status: every 30 minutes (was 10). It records the status page's samples, warns about anything down
--     and counts every team's objectives (the safety net), so those are 30 minutes apart now.
--   * vplanner-live: still every 10 minutes, but analytics_live_fanout(at) now calls the app for a team and platform
--     only on the hour's first run (once an hour), or on every run while that team has a video out on that platform
--     in the last 48 hours, when the counts move fast. It was every team and platform, every 10 minutes.
--   * vplanner-outliers: every 3 hours (was twice an hour). The collector paces its day's share of YouTube by the
--     hour, so a day's collecting takes fewer, longer calls (and the app asks for less of it too, 1.52.0).
--
-- Additive and safe to run twice.

-- The function takes the time it runs at now (the tests pick it), so the one without it goes first: two of them
-- would make "select analytics_live_fanout()" ambiguous.
drop function if exists analytics_live_fanout();

create or replace function analytics_live_fanout(p_at timestamptz default now())
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
  -- The hour's first run (:05): everyone.
  v_hourly boolean := extract(minute from p_at) < 10;
begin
  for r in
    select distinct a.team_id, a.platform
      from social_accounts a
     where a.status = 'active'
       and a.platform in ('youtube', 'instagram', 'tiktok', 'facebook')
       and (
         v_hourly
         -- A video out in the last 48 hours: every 10 minutes, as the counts move fast. Whether ClipTroop posted it
         -- or not (analytics_content has every video the platform listed), and one ClipTroop just posted that the
         -- analytics haven't listed yet.
         or exists (
           select 1 from analytics_content c
            where c.team_id = a.team_id and c.platform = a.platform
              and c.published_at > p_at - interval '48 hours' and c.published_at <= p_at
         )
         or exists (
           select 1 from social_posts p
            where p.team_id = a.team_id and p.platform = a.platform and p.status = 'published'
              and coalesce(p.published_at, p.updated_at) > p_at - interval '48 hours'
         )
       )
  loop
    perform posting_call(jsonb_build_object('job', 'live', 'team', r.team_id, 'platform', r.platform));
    n := n + 1;
  end loop;
  -- As before (0086): counts older than 8 days go; after 48 hours only the last count of each hour stays.
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
revoke all on function analytics_live_fanout(timestamptz) from public, anon, authenticated;

select cron.schedule('vplanner-status', '*/30 * * * *', $$ select status_tick(); $$);
select cron.schedule('vplanner-live', '5-59/10 * * * *', $$ select analytics_live_fanout(); $$);
select cron.schedule('vplanner-outliers', '17 */3 * * *', $$ select outliers_fanout(); $$);

-- What the timers do now, for App setup (it reads this to know 0129 ran, and shows it).
create or replace function public.timer_plan()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'status', 'every 30 minutes',
    'live', 'once an hour; every 10 minutes for a team with a video out from the last 48 hours',
    'outliers', 'every 3 hours'
  );
$$;
revoke all on function public.timer_plan() from public, anon;
grant execute on function public.timer_plan() to authenticated, service_role;
