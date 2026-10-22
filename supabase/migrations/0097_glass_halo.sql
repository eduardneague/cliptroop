-- ============================================================================
-- 0097: A third glass style, Halo (1.29.3)
--
-- profiles.glass_style may now be 'halo' as well as 'simple' and 'liquid'
-- (Settings → Preferences → Glass → Style). The check that keeps it to known
-- styles (0093) is replaced by one that knows the new one; nothing else
-- changes, and everyone keeps the style they had.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

alter table profiles drop constraint if exists profiles_glass_style_check;
alter table profiles add constraint profiles_glass_style_check check (glass_style in ('simple', 'liquid', 'halo'));
