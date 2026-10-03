-- ============================================================================
-- 0049: swap two shorts (calendar: drop a short onto a short on another day)
--
--   swap_shorts(a, b): they trade places.
--     * both automatic → they trade queue positions (both stay automatic).
--     * otherwise → they trade their whole scheduling (date, auto / fixed,
--       queue start / one-off, queue position): A goes where B was.
--   Masters and schedulers; only the master can move the queue start.
--   Not for posted shorts or ones with scheduled posts. The queue re-runs.
-- Staging first, then production.
-- ============================================================================

create or replace function swap_shorts(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  a short_videos;
  b short_videos;
begin
  if p_a = p_b then
    return;
  end if;
  -- Lock in a fixed order (no deadlocks).
  perform 1 from short_videos where id in (p_a, p_b) order by id for update;
  select * into a from short_videos where id = p_a;
  select * into b from short_videos where id = p_b;
  if a.id is null or b.id is null or a.team_id <> b.team_id or a.team_id not in (select my_team_ids()) then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(a.team_id) or has_team_role(a.team_id, 'publisher')) then
    raise exception 'Only the master or a scheduler can move shorts.' using errcode = '42501';
  end if;
  if a.stage = 'posted' or b.stage = 'posted' then
    raise exception 'Posted shorts can''t be moved.' using errcode = '23514';
  end if;
  if exists (select 1 from social_posts where short_id in (p_a, p_b) and status <> 'cancelled') then
    raise exception 'One of them has scheduled posts. Change their times from the Posting panel.' using errcode = '23514';
  end if;
  if not is_team_master(a.team_id)
     and ((a.schedule_mode = 'pinned' and a.pin_kind = 'anchor') or (b.schedule_mode = 'pinned' and b.pin_kind = 'anchor')) then
    raise exception 'Only the master can move the queue start.' using errcode = '42501';
  end if;

  perform set_config('vp.short_system', 'on', true);
  if a.schedule_mode = 'auto' and b.schedule_mode = 'auto' then
    update short_videos set queue_position = b.queue_position where id = p_a;
    update short_videos set queue_position = a.queue_position where id = p_b;
  else
    -- Clear both first so there's never a second queue start in between.
    update short_videos set schedule_mode = 'auto', pin_kind = null where id in (p_a, p_b);
    update short_videos
       set schedule_mode = b.schedule_mode, pin_kind = b.pin_kind, planned_date = b.planned_date, queue_position = b.queue_position
     where id = p_a;
    update short_videos
       set schedule_mode = a.schedule_mode, pin_kind = a.pin_kind, planned_date = a.planned_date, queue_position = a.queue_position
     where id = p_b;
  end if;
  perform set_config('vp.short_system', 'off', true);
  perform recalc_short_queue(a.team_id);
end;
$$;
grant execute on function swap_shorts(uuid, uuid) to authenticated;
