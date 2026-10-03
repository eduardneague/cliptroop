-- ============================================================================
-- 0059 · Facebook Pages for Analytics (1.6)
--   * 'facebook' is allowed as a connected account, a sign-in in progress
--     and in every analytics table. (Facebook is connected for analytics
--     only: VPlanner doesn't post to it.)
--   * analytics_daily.engagements: Facebook reports one "post engagements"
--     number (reactions, comments, shares together) instead of each part.
-- Run on staging, then production. Safe to run more than once.
-- ============================================================================

do $$
declare
  t text;
  c record;
begin
  foreach t in array array['social_accounts', 'oauth_states', 'analytics_daily', 'analytics_countries', 'analytics_content', 'analytics_syncs'] loop
    -- Drop the old "platform in (youtube, instagram, tiktok)" check, whatever it's called…
    for c in
      select con.conname
      from pg_constraint con
      where con.conrelid = format('public.%I', t)::regclass
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%platform%'
        and pg_get_constraintdef(con.oid) ilike '%tiktok%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    -- …and add the new one.
    execute format(
      'alter table public.%I add constraint %I check (platform in (''youtube'', ''instagram'', ''tiktok'', ''facebook''))',
      t, t || '_platform_check'
    );
  end loop;
end $$;

alter table analytics_daily add column if not exists engagements bigint;
