-- ============================================================================
-- 0073: only masters and schedulers change a long video's date (1.12.1)
--
--   A long video's expected date (what the Calendar shows and moves) can be
--   changed by masters and schedulers only. Before, anyone holding the
--   video's current stage could change it through the database, and
--   schedulers couldn't move long videos on the Calendar at all (the app
--   now saves their moves itself, after checking the role).
--   Same function as 0045 plus the date rule.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create or replace function guard_project_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'A project can''t be moved to another team.' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A project''s creator can''t be changed.' using errcode = '42501';
  end if;
  if new.entry_number is distinct from old.entry_number
     and coalesce(current_setting('vp.renumber', true), 'off') <> 'on' then
    raise exception 'Entry numbers can''t be changed.' using errcode = '42501';
  end if;
  if new.stage is distinct from old.stage
     and not is_team_master(old.team_id)
     and coalesce(current_setting('vp.long_step', true), 'off') <> 'on' then
    raise exception 'Only the master can change a project''s stage.' using errcode = '42501';
  end if;
  if new.expected_date is distinct from old.expected_date
     and not (is_team_master(old.team_id) or has_team_role(old.team_id, 'publisher')) then
    raise exception 'Only the master or a scheduler can change the date.' using errcode = '42501';
  end if;
  return new;
end;
$$;
