-- ============================================================================
-- 0085: Sync now in the background, and YouTube's whole history (1.21.0)
--
--   * analytics_sync_now(team): "Sync now" no longer copies every platform in
--     the request itself (four platforms one after another could take longer
--     than the request may last, and the page crashed). It sends one call per
--     platform of the team, each with its own time, like the morning copy,
--     and answers straight away; the page refreshes itself as the numbers
--     land. Masters and schedulers only; at most once every 90 seconds per
--     team (analytics_syncs.sync_requested_at).
--   * analytics_syncs.history_from / history_done: how far back YouTube's
--     numbers per day go. The first copy fetches 90 days; each copy now
--     fetches older years too, newest first, while it has time, until the
--     channel's first day (history_done), so Lifetime starts when the
--     channel did, not 90 days before it was connected. Another account
--     connected starts it over.
--   * analytics_content_days.subscribers_gained / avg_view_seconds: a video's
--     subscribers and average view per day (its analytics page's charts,
--     like YouTube Studio's; filled when the page asks YouTube).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

alter table analytics_syncs add column if not exists history_from date;
alter table analytics_syncs add column if not exists history_done boolean not null default false;
alter table analytics_syncs add column if not exists sync_requested_at timestamptz;

alter table analytics_content_days add column if not exists subscribers_gained bigint;
alter table analytics_content_days add column if not exists avg_view_seconds numeric(10, 1);

create or replace function analytics_sync_now(p_team uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if not (is_team_master(p_team) or has_team_role(p_team, 'publisher')) then
    raise exception 'Only masters and schedulers can sync.' using errcode = '42501';
  end if;
  -- Just asked: the copy is on its way (-1 = wait a moment).
  if exists (
    select 1 from analytics_syncs
     where team_id = p_team and sync_requested_at > now() - interval '90 seconds'
  ) then
    return -1;
  end if;
  for r in
    select distinct platform
      from social_accounts
     where team_id = p_team
       and status = 'active'
       and platform in ('youtube', 'instagram', 'tiktok', 'facebook')
  loop
    -- (A database without the timer's secrets answers null: nothing was sent.)
    if posting_call(jsonb_build_object('job', 'analytics', 'team', p_team, 'platform', r.platform, 'live', true)) is not null then
      insert into analytics_syncs (team_id, platform, sync_requested_at)
      values (p_team, r.platform, now())
      on conflict (team_id, platform) do update set sync_requested_at = excluded.sync_requested_at;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function analytics_sync_now(uuid) from public, anon;
grant execute on function analytics_sync_now(uuid) to authenticated;
