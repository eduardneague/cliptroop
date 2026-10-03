-- ============================================================================
-- 0048: up to 3 winners per long video (A/B testing thumbnails + titles)
--
--   toggle_package_winner(entry): marks / unmarks a variation as a winner.
--   At most 3 per video. Masters and packagers. Replaces the one-winner rule.
-- Staging first, then production.
-- ============================================================================

drop index if exists package_entries_one_winner;

create or replace function toggle_package_winner(p_entry uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  e package_entries;
  v_team uuid;
begin
  select * into e from package_entries where id = p_entry for update;
  select team_id into v_team from long_video_projects where id = e.project_id;
  if e.id is null or v_team not in (select my_team_ids()) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(v_team) or has_team_role(v_team, 'packager')) then
    raise exception 'Only the master or a packager can pick winners.' using errcode = '42501';
  end if;
  if not e.is_winner
     and (select count(*) from package_entries where project_id = e.project_id and is_winner) >= 3 then
    raise exception 'Pick up to 3 winners (for A/B testing). Unpick one first.' using errcode = '23514';
  end if;
  update package_entries set is_winner = not e.is_winner where id = p_entry;
  return not e.is_winner;
end;
$$;
grant execute on function toggle_package_winner(uuid) to authenticated;

-- The old single-winner function is no longer used.
drop function if exists set_package_winner(uuid);
