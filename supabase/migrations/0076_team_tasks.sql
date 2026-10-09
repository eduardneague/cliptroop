-- ============================================================================
-- 0076: the team's tasks, for those the team allows (1.13.0)
--
--   * teams.tasks_visibility: who can see everyone's tasks (who has to do
--     what) in My tasks → Team:
--       'own'     nobody: everyone sees only their own (the default, as before)
--       'masters' masters see everyone's
--       'team'    everyone on the team sees everyone's
--     Masters change it (Team → Defaults → Tasks).
--   * tasks: a second read rule, "team tasks when shared", next to "your own
--     tasks". Still read-only for everyone (tasks are written by triggers).
--   * shared_task_team_ids() / can_see_team_tasks(): the teams whose tasks
--     the signed-in person may see.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

alter table teams add column if not exists tasks_visibility text not null default 'own';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.teams'::regclass and conname = 'teams_tasks_visibility_check') then
    alter table teams add constraint teams_tasks_visibility_check check (tasks_visibility in ('own', 'masters', 'team'));
  end if;
end $$;
grant update (tasks_visibility) on teams to authenticated;

create or replace function shared_task_team_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select t.id
  from teams t
  where (t.tasks_visibility = 'team' and t.id in (select my_team_ids()))
     or (t.tasks_visibility = 'masters' and t.id in (select my_master_team_ids()));
$$;
revoke all on function shared_task_team_ids() from public, anon;
grant execute on function shared_task_team_ids() to authenticated;

create or replace function can_see_team_tasks(p_team uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_team in (select shared_task_team_ids());
$$;
revoke all on function can_see_team_tasks(uuid) from public, anon;
grant execute on function can_see_team_tasks(uuid) to authenticated;

drop policy if exists "team tasks when shared" on tasks;
create policy "team tasks when shared" on tasks for select to authenticated
  using (team_id in (select shared_task_team_ids()));
