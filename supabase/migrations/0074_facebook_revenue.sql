-- ============================================================================
-- 0074: Facebook earnings in Revenue (1.12.2)
--
--   * analytics_revenue_daily: 'facebook' is allowed next to 'youtube'.
--     The daily sync copies a Page's Content Monetization earnings
--     (content_monetization_earnings) as one amount per day, content 'all'.
--     Same read rules as YouTube's revenue (masters and the people a master
--     picks), and like YouTube's, only the server writes it.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

do $$
declare
  c record;
begin
  -- Drop the old "platform in ('youtube')" check, whatever it's called…
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.analytics_revenue_daily'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%platform%'
      and pg_get_constraintdef(con.oid) ilike '%youtube%'
  loop
    execute format('alter table public.analytics_revenue_daily drop constraint %I', c.conname);
  end loop;
  -- …and add the new one.
  alter table public.analytics_revenue_daily
    add constraint analytics_revenue_daily_platform_check check (platform in ('youtube', 'facebook'));
end $$;
