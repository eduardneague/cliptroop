-- ============================================================================
-- 0110: real visitors' speed (1.32.4)
--
-- Each time someone opens the app (a full page load), their browser measures
-- the Web Vitals Google uses: LCP (until the biggest thing is on screen), INP
-- (the answer to a tap), CLS (the page jumping around), FCP (the first
-- paint) and TTFB (the server's first byte). /api/vitals keeps them here, 30
-- days, and the Developer page's Speed tab shows the 75th percentile of each
-- (what 3 visits in 4 were at least as fast as), for phones and computers,
-- and the slowest pages.
--
--   * web_vitals: one row per measure, with nothing about who: the page
--     without ids (lib/web-vitals.ts pageOf), phone or computer, the
--     connection's speed, how the page was opened, the app's version.
--     vital_id is the browser's id for the measure: one that grows later
--     (CLS, INP) replaces its row.
--   * Server only: row-level security on, no rule, no rights for signed-in
--     people or visitors (only the service key writes and reads).
--   * web_vitals_summary(days): the numbers the Speed tab shows, worked out
--     here (the 75th percentile, how many good and poor), for each measure
--     by device and by page. The service key only.
--
-- supabase/tests/web-vitals.test.sql checks it. Additive; safe to run twice.
-- Staging first, then production.
-- ============================================================================

create table if not exists web_vitals (
  id bigint generated always as identity primary key,
  vital_id text not null unique check (char_length(vital_id) between 6 and 64),
  at timestamptz not null default now(),
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null check (value >= 0 and value <= 600000),
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  page text not null check (char_length(page) between 1 and 200),
  device text not null check (device in ('phone', 'computer')),
  connection text check (connection in ('slow-2g', '2g', '3g', '4g')),
  nav text check (char_length(nav) <= 20),
  version text check (char_length(version) <= 20)
);
create index if not exists web_vitals_at_idx on web_vitals (at);

alter table web_vitals enable row level security;
revoke all on table web_vitals from anon, authenticated;
revoke all on sequence web_vitals_id_seq from anon, authenticated;

create or replace function web_vitals_summary(p_days int default 7)
returns table (metric text, device text, page text, loads bigint, p75 double precision, good bigint, poor bigint)
language sql
stable
set search_path = public
as $$
  select w.metric,
         case when grouping(w.device) = 0 then w.device end,
         case when grouping(w.page) = 0 then w.page end,
         count(*),
         percentile_cont(0.75) within group (order by w.value),
         count(*) filter (where w.rating = 'good'),
         count(*) filter (where w.rating = 'poor')
    from web_vitals w
   where w.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
   group by grouping sets ((w.metric, w.device), (w.metric, w.page))
$$;
revoke all on function web_vitals_summary(int) from public, anon, authenticated;
grant execute on function web_vitals_summary(int) to service_role;

notify pgrst, 'reload schema';
