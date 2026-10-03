-- ============================================================================
-- 0060: colour theme per account (1.6)
--
-- profiles.palette: the colour theme picked in Settings → Preferences →
-- Colours ("ocean", "forest"…). Empty = the original (Clippy). Each person
-- changes only their own. Safe to run more than once.
-- ============================================================================

alter table profiles add column if not exists palette text check (palette is null or palette ~ '^[a-z]{2,20}$');
grant update (palette) on profiles to authenticated;
