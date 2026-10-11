-- ============================================================================
-- 0081: Advanced analytics and Download for Claude (1.16.0)
--
--   * analytics_breakdowns: how the numbers split. Traffic sources, search
--     terms, outside sites, devices, operating systems, where videos were
--     watched, subscribers or not, YouTube's apps, age and gender, cities,
--     sharing services, Instagram's followers vs everyone else… Per day, or
--     for a window (the last 7 / 28 / 90 / 365 days, or everything up to a
--     day), for the whole account or for one video.
--   * analytics_retention: each video's audience retention curve (YouTube;
--     Facebook Reels when Meta shares it).
--   * analytics_daily.metrics / analytics_content.metrics: every other number
--     the platforms share, per day and per video (Premium views, cards,
--     playlist removals, Instagram's accounts engaged, profile link taps,
--     replies, a Reel's total watch time, Facebook Reels' replays…).
--   * analytics_content_revenue: each video's revenue, CPM, ad impressions
--     and monetized playbacks. Only the people who see revenue read it, like
--     analytics_revenue_daily, which gets the same numbers per day.
--   * short_video_versions.frames_path + the private "video-frames" bucket:
--     eight frames of each uploaded version (its first seconds and the
--     story), kept after the video file itself is cleaned up, for the PDF
--     made for Claude. set_version_frames() saves them on a version.
-- Everything here is written by the server (the daily copy) except the
-- frames, which the uploader adds. Staging first, then production. Safe to
-- run more than once.
-- ============================================================================

-- 1. Every other number, per day and per video -------------------------------------
alter table analytics_daily add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table analytics_daily drop constraint if exists analytics_daily_metrics_check;
alter table analytics_daily add constraint analytics_daily_metrics_check
  check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 8000);

alter table analytics_content add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table analytics_content drop constraint if exists analytics_content_metrics_check;
alter table analytics_content add constraint analytics_content_metrics_check
  check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 8000);

-- Money per day (YouTube): what advertisers paid per 1,000 ad impressions,
-- per 1,000 playbacks with ads, how many ads were shown and how many plays had one.
alter table analytics_revenue_daily add column if not exists cpm numeric(12, 4);
alter table analytics_revenue_daily add column if not exists playback_cpm numeric(12, 4);
alter table analytics_revenue_daily add column if not exists ad_impressions bigint;
alter table analytics_revenue_daily add column if not exists monetized_playbacks bigint;

-- 2. How the numbers split ------------------------------------------------------------
create table if not exists analytics_breakdowns (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  -- '' = the whole account; otherwise one video (the platform's own id).
  external_id text not null default '' check (char_length(external_id) <= 200),
  -- traffic_source, search_term, device, os, age_gender, city, …
  dimension text not null check (dimension ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- The platform's own name for the slice (YT_SEARCH, MOBILE, age25-34|female…).
  key text not null check (char_length(key) between 1 and 300),
  -- span 1: that day. 7 / 28 / 90 / 365: the days up to and including `day`.
  -- 0: everything up to `day` (for a video: since it was published).
  day date not null,
  span smallint not null default 1 check (span in (0, 1, 7, 28, 90, 365)),
  views bigint,
  watch_minutes numeric(16, 1),
  -- Anything else: a percentage, a count of people, shares…
  value numeric(18, 4),
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, external_id, dimension, span, day, key)
);
create index if not exists analytics_breakdowns_team_dim_idx on analytics_breakdowns (team_id, dimension, day);

-- 3. Retention curves ------------------------------------------------------------------
create table if not exists analytics_retention (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok', 'facebook')),
  external_id text not null check (char_length(external_id) <= 200),
  -- [[where in the video 0…1, share of viewers still watching (1 = all of
  -- them; above 1 with rewatches), compared with similar videos 0…1 or null], …]
  points jsonb not null check (jsonb_typeof(points) = 'array' and octet_length(points::text) <= 32000),
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, external_id)
);

-- 4. Each video's money ------------------------------------------------------------------
create table if not exists analytics_content_revenue (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'facebook')),
  external_id text not null check (char_length(external_id) <= 200),
  revenue numeric(14, 4),
  ad_revenue numeric(14, 4),
  premium_revenue numeric(14, 4),
  gross_revenue numeric(14, 4),
  cpm numeric(12, 4),
  playback_cpm numeric(12, 4),
  ad_impressions bigint,
  monetized_playbacks bigint,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, external_id)
);

-- 5. Who reads them: teammates; money only the people who see revenue. Only the server writes.
do $$
declare
  t text;
begin
  foreach t in array array['analytics_breakdowns', 'analytics_retention'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format('drop policy if exists "team reads %s" on %I', t, t);
    execute format('create policy "team reads %s" on %I for select to authenticated using (team_id in (select my_team_ids()))', t, t);
  end loop;
end $$;

-- The per-day splits added up over a range (a year of them is too many rows
-- to send). Runs as the person asking: they only ever add up their own
-- team's rows. value: averaged, weighted by views where there are views.
create or replace function analytics_breakdown_sums(p_team uuid, p_platform text, p_from date, p_to date)
returns table (dimension text, key text, views bigint, watch_minutes numeric, value numeric, days int)
language sql
stable
security invoker
set search_path = public
as $$
  select b.dimension,
         b.key,
         sum(b.views)::bigint,
         sum(b.watch_minutes),
         coalesce(sum(b.value * b.views) filter (where b.value is not null and b.views > 0) / nullif(sum(b.views) filter (where b.value is not null and b.views > 0), 0), avg(b.value)),
         count(distinct b.day)::int
    from analytics_breakdowns b
   where b.team_id = p_team
     and b.platform = p_platform
     and b.external_id = ''
     and b.span = 1
     and b.day between p_from and p_to
   group by b.dimension, b.key;
$$;
revoke all on function analytics_breakdown_sums(uuid, text, date, date) from public, anon;
grant execute on function analytics_breakdown_sums(uuid, text, date, date) to authenticated;

alter table analytics_content_revenue enable row level security;
revoke all on analytics_content_revenue from anon, authenticated;
grant select on analytics_content_revenue to authenticated;
drop policy if exists "video revenue for masters and chosen people" on analytics_content_revenue;
create policy "video revenue for masters and chosen people" on analytics_content_revenue for select to authenticated
  using (can_view_revenue(team_id));

-- 6. Frames of each uploaded video ------------------------------------------------------
-- One JPEG per version: <team>/<short>/<version>.jpg (the opening seconds and
-- the story, 8 frames). Small, and kept when the video file is cleaned up.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-frames', 'video-frames', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "teammates read video frames" on storage.objects;
create policy "teammates read video frames"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'video-frames'
    and review_path_ok(name)
    and ((storage.foldername(name))[1])::uuid in (select my_team_ids())
  );

drop policy if exists "editors add video frames" on storage.objects;
create policy "editors add video frames"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'video-frames'
    and review_path_ok(name)
    and can_upload_short_video(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "masters delete video frames" on storage.objects;
create policy "masters delete video frames"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'video-frames'
    and review_path_ok(name)
    and is_team_master(((storage.foldername(name))[1])::uuid)
  );

alter table short_video_versions add column if not exists frames_path text;
alter table short_video_versions drop constraint if exists short_video_versions_frames_path_check;
alter table short_video_versions add constraint short_video_versions_frames_path_check
  check (frames_path is null or char_length(frames_path) <= 300);

-- The uploader saves a version's frames once they're in storage (people
-- can't change versions themselves): only someone who may upload to that
-- short, only that version's own file name, only a file that's really there.
create or replace function set_version_frames(p_version uuid, p_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v record;
begin
  select id, short_id, team_id into v from short_video_versions where id = p_version;
  if v.id is null then
    raise exception 'That version doesn''t exist.' using errcode = '23514';
  end if;
  if not can_upload_short_video(v.short_id) then
    raise exception 'You can''t change this version.' using errcode = '42501';
  end if;
  if p_path is distinct from (v.team_id::text || '/' || v.short_id::text || '/' || v.id::text || '.jpg') then
    raise exception 'Those frames aren''t this version''s.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'video-frames' and name = p_path) then
    raise exception 'The frames didn''t upload. Try again.' using errcode = '23514';
  end if;
  update short_video_versions set frames_path = p_path where id = p_version;
end;
$$;
revoke all on function set_version_frames(uuid, text) from public, anon;
grant execute on function set_version_frames(uuid, text) to authenticated;

-- A new version never arrives with frames already set (only the function above sets them).
create or replace function short_video_versions_frames_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.frames_path := null;
  end if;
  return new;
end;
$$;
drop trigger if exists short_video_versions_frames_guard on short_video_versions;
create trigger short_video_versions_frames_guard
  before insert on short_video_versions
  for each row execute procedure short_video_versions_frames_guard();
