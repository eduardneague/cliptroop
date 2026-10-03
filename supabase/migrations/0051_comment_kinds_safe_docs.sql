-- ============================================================================
-- 0051: comment types + creating the default documents safely
--
--   * script_comments.kind: 'comment' or 'edit_idea' ("Editing idea").
--   * ensure_script_docs(short, long): creates the default documents
--     (Script · Review · Staging, + Research for long videos) in ONE step,
--     with a per-video lock, so two pages opening at the same moment can't
--     collide (that caused "No script has been written" now and then).
--     Only creates what the caller is allowed to create.
-- Staging first, then production.
-- ============================================================================

alter table script_comments add column if not exists kind text not null default 'comment';
alter table script_comments drop constraint if exists script_comments_kind_check;
alter table script_comments add constraint script_comments_kind_check check (kind in ('comment', 'edit_idea'));

create or replace function ensure_script_docs(p_short uuid, p_long uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
  v_scripts int;
  v_names text[];
  v_can_script boolean;
  v_can_research boolean;
begin
  if num_nonnulls(p_short, p_long) <> 1 then
    raise exception 'Pass a short or a long video.' using errcode = '22023';
  end if;
  v_team := coalesce(
    (select team_id from short_videos where id = p_short),
    (select team_id from long_video_projects where id = p_long)
  );
  if v_team is null or v_team not in (select my_team_ids()) then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;

  -- One at a time per video.
  perform pg_advisory_xact_lock(hashtext('script-docs:' || coalesce(p_short, p_long)::text));

  v_can_script := can_edit_doc(v_team, p_short, p_long, 'script');
  v_can_research := p_long is not null and can_edit_doc(v_team, null, p_long, 'research');

  select count(*), coalesce(array_agg(name), '{}') into v_scripts, v_names
    from scripts
   where kind = 'script' and (short_video_id = p_short or long_video_id = p_long);

  -- Defaults the first time (a lone existing script becomes "Script").
  if v_can_script and v_scripts <= 1 then
    if v_scripts = 0 then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position) values (v_team, p_short, p_long, 'script', 'Script', 1);
    end if;
    if not ('Review' = any (v_names)) then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position) values (v_team, p_short, p_long, 'script', 'Review', 2);
    end if;
    if not ('Staging' = any (v_names)) then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position) values (v_team, p_short, p_long, 'script', 'Staging', 3);
    end if;
  end if;

  if v_can_research and not exists (select 1 from scripts where kind = 'research' and long_video_id = p_long) then
    insert into scripts (team_id, long_video_id, kind, name, position) values (v_team, p_long, 'research', 'Research', 1);
  end if;
end;
$$;
grant execute on function ensure_script_docs(uuid, uuid) to authenticated;
