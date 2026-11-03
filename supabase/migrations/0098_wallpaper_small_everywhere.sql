-- ============================================================================
-- 0098: Small wallpapers, and a wallpaper on every page (1.29.4)
--
--   * The "dashboard-backgrounds" bucket takes files of 2 MB at most (was
--     25 MB). The app makes every wallpaper small before it uploads it
--     (pictures as WebP, videos and moving GIFs as a WebM of up to 30
--     seconds), so pages never wait for a big file; this makes sure nothing
--     bigger gets in another way. Files already there stay (Settings offers
--     to make a big one lighter).
--   * profiles.dashboard_bg_everywhere: your wallpaper behind every page of
--     the app, not only the dashboard (off by default; yours to change).
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

update storage.buckets set file_size_limit = 2097152 where id = 'dashboard-backgrounds';

alter table profiles add column if not exists dashboard_bg_everywhere boolean not null default false;
grant update (dashboard_bg_everywhere) on profiles to authenticated;
