-- ============================================================================
-- 0052: default people for long videos + "filmed" by the assigned filmer
--
--   * teams.default_long_{researcher,filmer,editor,packager,publisher}_id:
--     pre-filled on the new long video form (with the default scripter).
--   * long_mark_filmed: the filmer ASSIGNED to the video (or a master) marks
--     it filmed. If nobody is assigned to Film, any filmer may.
-- Staging first, then production.
-- ============================================================================

alter table teams
  add column if not exists default_long_researcher_id uuid references team_members(id) on delete set null,
  add column if not exists default_long_filmer_id uuid references team_members(id) on delete set null,
  add column if not exists default_long_editor_id uuid references team_members(id) on delete set null,
  add column if not exists default_long_packager_id uuid references team_members(id) on delete set null,
  add column if not exists default_long_publisher_id uuid references team_members(id) on delete set null;
create index if not exists teams_dl_researcher_idx on teams (default_long_researcher_id);
create index if not exists teams_dl_filmer_idx on teams (default_long_filmer_id);
create index if not exists teams_dl_editor_idx on teams (default_long_editor_id);
create index if not exists teams_dl_packager_idx on teams (default_long_packager_id);
create index if not exists teams_dl_publisher_idx on teams (default_long_publisher_id);
grant update (default_long_researcher_id, default_long_filmer_id, default_long_editor_id, default_long_packager_id, default_long_publisher_id) on teams to authenticated;

create or replace function long_mark_filmed(p_project uuid, p_nas_path text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects := long_step_project(p_project, 'film');
  v_path text := nullif(btrim(coalesce(p_nas_path, '')), '');
  v_assigned boolean;
begin
  select exists (select 1 from project_assignees where project_id = p_project and stage = 'film') into v_assigned;
  if not (
    is_team_master(p.team_id)
    or (v_assigned and exists (
          select 1 from project_assignees pa join team_members tm on tm.id = pa.team_member_id
           where pa.project_id = p_project and pa.stage = 'film' and tm.user_id = auth.uid() and tm.status = 'active'))
    or (not v_assigned and has_team_role(p.team_id, 'filmer'))
  ) then
    raise exception 'Only the assigned filmer (or the master) can mark it filmed.' using errcode = '42501';
  end if;
  perform set_config('vp.long_step', 'on', true);
  update long_video_projects
     set stage = 'edit', filmed_at = now(), filmed_by = auth.uid(), nas_path = coalesce(v_path, nas_path)
   where id = p_project;
  perform set_config('vp.long_step', 'off', true);
  perform long_step_note(p_project, 'film',
    'Filmed and uploaded to the NAS' || case when v_path is not null then ': ' || v_path else '.' end);
end;
$$;
grant execute on function long_mark_filmed(uuid, text) to authenticated;
