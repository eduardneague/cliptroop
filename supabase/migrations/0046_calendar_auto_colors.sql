-- ============================================================================
-- 0046: calendar moves that stay automatic + team colours for shorts / longs
--
--   * move_short_auto(short, day): an AUTOMATIC short moved on the calendar
--     stays automatic: it's placed in the queue right after everything
--     planned up to that day, and the queue re-runs. It lands on that day
--     if there's room, otherwise on the next free day (the return value).
--     Masters and schedulers; not for posted shorts or ones with scheduled
--     posts; not before today.
--   * teams.short_color / long_color: the team's colours for shorts and long
--     videos, used everywhere in the app.
-- Staging first, then production.
-- ============================================================================

alter table teams
  add column if not exists short_color text not null default '#EA580C'
    check (short_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists long_color text not null default '#0EA5E9'
    check (long_color ~ '^#[0-9a-fA-F]{6}$');
grant update (short_color, long_color) on teams to authenticated;

create or replace function move_short_auto(p_short uuid, p_day date)
returns date
language plpgsql
security definer set search_path = public
as $$
declare
  s short_videos;
  v_day date;
begin
  select * into s from short_videos where id = p_short for update;
  if s.id is null or s.team_id not in (select my_team_ids()) then
    raise exception 'Short not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(s.team_id) or has_team_role(s.team_id, 'publisher')) then
    raise exception 'Only the master or a scheduler can move shorts.' using errcode = '42501';
  end if;
  if s.stage = 'posted' then
    raise exception 'It''s already posted.' using errcode = '23514';
  end if;
  if s.schedule_mode <> 'auto' then
    raise exception 'This short has a fixed date.' using errcode = '23514';
  end if;
  if exists (select 1 from social_posts where short_id = p_short and status <> 'cancelled') then
    raise exception 'It has scheduled posts. Change their times from its Posting panel.' using errcode = '23514';
  end if;
  if p_day < current_date then
    raise exception 'Pick today or a later day.' using errcode = '23514';
  end if;

  perform set_config('vp.short_system', 'on', true);
  update short_videos
     set queue_position = short_position_for_date(s.team_id, p_day, s.id)
   where id = p_short;
  perform set_config('vp.short_system', 'off', true);
  perform recalc_short_queue(s.team_id);

  select planned_date into v_day from short_videos where id = p_short;
  return v_day;
end;
$$;
grant execute on function move_short_auto(uuid, date) to authenticated;
