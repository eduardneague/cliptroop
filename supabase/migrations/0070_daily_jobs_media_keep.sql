-- ============================================================================
-- 0070: the daily jobs run on Supabase's timer + how long video files stay
--
--   * teams.media_keep_days: once a short is posted everywhere, its video
--     files (every version, bucket review-videos) are deleted after 7, 14
--     (the default), 21 or 30 days. The short itself stays (title, script,
--     notes, numbers). Masters pick it in Team -> Defaults.
--   * The two daily jobs move from Vercel Cron to pg_cron. Vercel only runs
--     its crons on the production deployment, so staging never copied
--     analytics or cleaned up files. Now both copies work the same way as
--     the posting timer: posting_call() sends {"job": "cleanup"} at 03:30
--     UTC and {"job": "analytics"} at 05:10 UTC to /api/cron/posting (with
--     cron_secret, and vercel_bypass when it's set).
-- Staging first, then production.
-- ============================================================================

alter table teams add column if not exists media_keep_days smallint not null default 14;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_media_keep_days_check') then
    alter table teams add constraint teams_media_keep_days_check check (media_keep_days in (7, 14, 21, 30));
  end if;
end $$;

-- Masters only: the "masters can update team details" policy (0022).
grant update (media_keep_days) on teams to authenticated;

-- Scheduling the same name again just updates it.
select cron.schedule('vplanner-cleanup', '30 3 * * *', $$ select posting_call('{"job": "cleanup"}'::jsonb); $$);
select cron.schedule('vplanner-analytics', '10 5 * * *', $$ select posting_call('{"job": "analytics"}'::jsonb); $$);
