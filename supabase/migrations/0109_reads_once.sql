-- ============================================================================
-- 0109: read rules that asked for every row now ask once (1.32.0)
--
-- A row rule that calls a function with the row's own team (like
-- can_view_revenue(team_id)) runs that function, a query of its own, for
-- every row read. On a team with a few years of numbers that's thousands of
-- little queries per page: 5,000 rows of video revenue took 48 ms to read,
-- 3,000 days of revenue 28 ms. Asked once instead ("is the row's team one of
-- the teams where you see revenue?", the same answer), they take 2.3 ms and
-- 1.2 ms, as the team rules already do since 0064.
--
--   * revenue_team_ids(): the teams where you see money (a Master, or given
--     access in Analytics → Revenue), the same rule as can_view_revenue.
--   * my_role_team_ids(role): the teams where you have that role.
--   * Rewritten, same answers: video revenue, daily revenue, other income,
--     projections and their points (money ones), who sees revenue, the
--     social accounts' history (Masters and Schedulers), the daily word's
--     plays (yours).
--   * Indexes on the 9 references that had none (who added a niche, a
--     channel, a folder, a saved video…; a team's job runs and hidden
--     ideas): deleting an account or a team no longer reads those tables
--     from end to end.
--
-- supabase/tests/reads-once.test.sql fails for a read rule that calls one of
-- these per-row checks again, and for a reference without an index.
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

create or replace function revenue_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
   where tm.user_id = auth.uid() and tm.status = 'active' and mr.role = 'master'
  union
  select ra.team_id
    from revenue_access ra
    join team_members tm on tm.team_id = ra.team_id and tm.user_id = ra.user_id and tm.status = 'active'
   where ra.user_id = auth.uid()
$$;
revoke all on function revenue_team_ids() from public, anon;
grant execute on function revenue_team_ids() to authenticated, service_role;

create or replace function my_role_team_ids(p_role role_type)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
   where tm.user_id = auth.uid() and tm.status = 'active' and mr.role = p_role
$$;
revoke all on function my_role_team_ids(role_type) from public, anon;
grant execute on function my_role_team_ids(role_type) to authenticated, service_role;

alter policy "video revenue for masters and chosen people" on analytics_content_revenue
  using (team_id in (select revenue_team_ids()));
alter policy "revenue for masters and chosen people" on analytics_revenue_daily
  using (team_id in (select revenue_team_ids()));
alter policy "revenue people read entries" on revenue_entries
  using (team_id in (select revenue_team_ids()));
alter policy "teammates see projections" on projections
  using ((team_id in (select my_team_ids())) and ((not money) or team_id in (select revenue_team_ids())));
alter policy "teammates see projection points" on projection_points
  using (exists (
    select 1 from projections p
     where p.id = projection_points.projection_id
       and p.team_id in (select my_team_ids())
       and ((not p.money) or p.team_id in (select revenue_team_ids()))
  ));
alter policy "masters and the person see access" on revenue_access
  using ((user_id = (select auth.uid())) or team_id in (select my_master_team_ids()));
alter policy "masters and schedulers read social history" on social_audit_log
  using ((team_id in (select my_master_team_ids())) or team_id in (select my_role_team_ids('publisher')));
alter policy "your own words" on daily_word_plays
  using (user_id = (select auth.uid()));

create index if not exists job_runs_team_idx on job_runs (team_id);
create index if not exists team_dictionary_added_by_idx on team_dictionary (added_by);
create index if not exists outlier_niches_created_by_idx on outlier_niches (created_by);
create index if not exists outlier_niche_channels_added_by_idx on outlier_niche_channels (added_by);
create index if not exists outlier_tracked_added_by_idx on outlier_tracked (added_by);
create index if not exists outlier_folders_created_by_idx on outlier_folders (created_by);
create index if not exists outlier_saves_saved_by_idx on outlier_saves (saved_by);
create index if not exists outlier_dismissed_team_idx on outlier_dismissed (team_id);
create index if not exists outlier_blocked_added_by_idx on outlier_blocked (added_by);
