-- 0130 (1.52.1): fewer timer calls still. The owner (Nov 16 2026), after 0129: "lets have outliers update once per day
-- and video numbers every 12 hours".
--
--   * vplanner-live: every 12 hours, at 06:05 and 18:05 UTC. analytics_live_fanout(at) calls every team and platform
--     each time (0129's "every 10 minutes for a team with a video from the last 48 hours" goes with it). Each call
--     reads every video once more than 3 hours have passed (modules/analytics/lib/live.ts), so nothing is skipped; the
--     morning copy (05:10 UTC) still brings each day's totals, and Sync now still reads on demand.
--   * vplanner-outliers: once a day, 05:17 UTC. That's late in YouTube's quota day (it starts at midnight in Los
--     Angeles: 07:00 or 08:00 UTC), so the collector, which paces the day's share by the hour, may use all of it in
--     that one run (it stops at its own time limit).
--   * vplanner-status stays every 30 minutes (0129).
--
-- Additive and safe to run twice.

create or replace function analytics_live_fanout(p_at timestamptz default now())
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  -- Every team and platform with a connected account, each run (p_at: when it runs; the tests set it).
  for r in
    select distinct team_id, platform
      from social_accounts
     where status = 'active'
       and platform in ('youtube', 'instagram', 'tiktok', 'facebook')
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

select cron.schedule('vplanner-live', '5 6,18 * * *', $$ select analytics_live_fanout(); $$);
select cron.schedule('vplanner-outliers', '17 5 * * *', $$ select outliers_fanout(); $$);

-- What the timers do now (App setup reads it: "12 hours" says this migration ran).
create or replace function public.timer_plan()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'status', 'every 30 minutes',
    'live', 'every 12 hours (06:05 and 18:05 UTC)',
    'outliers', 'once a day (05:17 UTC)'
  );
$$;
revoke all on function public.timer_plan() from public, anon;
grant execute on function public.timer_plan() to authenticated, service_role;
