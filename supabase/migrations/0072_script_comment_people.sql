-- ============================================================================
-- 0072: who can comment on a script (1.12.1)
--
--   Comments and editing ideas on a script document (and resolving them)
--   are for the people working on that video's script: masters, its
--   scripters, the Review and Staging people of its documents, and
--   researchers on research documents. Everyone else on the team still
--   reads them. (Before: anyone on the team could comment.)
--   Authors and masters can still delete (unchanged).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

create or replace function can_comment_script(p_script uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select can_edit_doc(s.team_id, s.short_video_id, s.long_video_id, s.kind)
        or exists (
          select 1
            from scripts d
           where d.team_id = s.team_id
             and d.step in ('review', 'staging')
             and (
               (s.short_video_id is not null and d.short_video_id = s.short_video_id)
               or (s.long_video_id is not null and d.long_video_id = s.long_video_id)
             )
             and is_script_step_person(d.id)
        )
      from scripts s
     where s.id = p_script
  ), false);
$$;
revoke all on function can_comment_script(uuid) from public, anon;
grant execute on function can_comment_script(uuid) to authenticated;

drop policy if exists "teammates comment" on script_comments;
drop policy if exists "script people comment" on script_comments;
create policy "script people comment" on script_comments for insert to authenticated
  with check (can_comment_script(script_id));

-- Resolving / reopening (and an author editing their own words): the same people.
drop policy if exists "teammates resolve comments" on script_comments;
drop policy if exists "script people resolve comments" on script_comments;
create policy "script people resolve comments" on script_comments for update to authenticated
  using (team_id in (select my_team_ids()) and (can_comment_script(script_id) or author_id = auth.uid()))
  with check (team_id in (select my_team_ids()) and (can_comment_script(script_id) or author_id = auth.uid()));
