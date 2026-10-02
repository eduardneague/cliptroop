-- ============================================================================
-- 0055: sounds on / off per account
--
-- profiles.sounds_enabled: the small UI sounds (checking things off, toasts,
-- notifications, drag and drop). On by default. Settings → Preferences.
-- Safe to run more than once.
-- ============================================================================

alter table profiles add column if not exists sounds_enabled boolean not null default true;
grant update (sounds_enabled) on profiles to authenticated;
