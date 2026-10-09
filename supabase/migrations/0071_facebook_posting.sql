-- ============================================================================
-- 0071: posting to Facebook (1.12)
--
--   * social_posts: 'facebook' is allowed. A short is posted to the team's
--     Facebook Page as a Reel, on its own schedule, like the other three.
--     (Before, Facebook was marked as posted when Instagram published,
--     because Instagram was expected to share it. Instagram doesn't share
--     posts made through its API, so Facebook now posts by itself.)
--   * teams.post_time_facebook: the Page's default posting time (18:00).
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

do $$
declare
  c record;
begin
  -- Drop the old "platform in (youtube, instagram, tiktok)" check, whatever it's called…
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.social_posts'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%platform%'
      and pg_get_constraintdef(con.oid) ilike '%tiktok%'
  loop
    execute format('alter table public.social_posts drop constraint %I', c.conname);
  end loop;
  -- …and add the new one.
  alter table public.social_posts
    add constraint social_posts_platform_check check (platform in ('youtube', 'instagram', 'tiktok', 'facebook'));
end $$;

alter table teams add column if not exists post_time_facebook time not null default '18:00';
grant update (post_time_facebook) on teams to authenticated;
