-- ============================================================================
-- 0041: team default YouTube description
--
-- Filled in automatically every time a short is scheduled to YouTube
-- (it can still be edited for one short). Masters set it in Team → Short
-- videos. Staging first, then production.
-- ============================================================================

alter table teams
  add column if not exists default_youtube_description text not null default ''
  check (char_length(default_youtube_description) <= 5000);
grant update (default_youtube_description) on teams to authenticated;
