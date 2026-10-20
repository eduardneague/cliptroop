-- ============================================================================
-- 0091: Outliers (1.27.0)
--
-- Videos that did far better than their channel usually does, in the niches a
-- team follows, plus the formats, keywords and ideas worked out from them.
--
--   * YouTube's public data, shared by every team (the server writes it, the
--     people on a team read it): yt_channels, yt_videos, yt_video_stats (views
--     over time), yt_video_changes (titles and thumbnails changed after
--     posting). YouTube's rules: data that isn't refreshed within 30 days is
--     deleted (outliers_purge, run by the collector), so every list a team
--     keeps (niche channels, tracked channels, saved videos) holds YouTube's
--     ids only and the collector reads them again.
--   * Each team's own: outlier_niches (name, keywords, the worked-out
--     insights), outlier_niche_channels / outlier_niche_hits (which channels
--     and videos belong to a niche), outlier_tracked, outlier_folders +
--     outlier_saves (saved videos, ideas and channels), outlier_dismissed
--     (ideas someone hid), outlier_settings (alerts and the weekly summary).
--     Built-in "explore" niches have no team (team_id null) and everyone on a
--     team can read them.
--   * Server only: outlier_quota (YouTube's daily budgets: searches, units,
--     stats calls), outlier_search_cache / outlier_search_log (live searches),
--     outlier_alerts (what was already announced), outlier_global (the
--     explore niches' combined insights).
--   * Reads go through SECURITY DEFINER functions that check you're on the
--     team first (outliers_videos, outliers_channels, outliers_video,
--     outliers_channel, outliers_overview): one round trip with every filter,
--     using the indexes.
--   * outliers_fanout(): the timer (every 30 minutes) calls the app once per
--     team that follows a niche or tracks a channel, and once for the explore
--     niches ({"job": "outliers"}).
--
-- Who may change what: masters and researchers manage niches, tracked
-- channels and which channels belong to a niche; masters set the alerts;
-- everyone on the team saves, makes folders and hides ideas (their own).
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
-- On any team at all (YouTube's public data is for people on a team).
create or replace function on_a_team()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from team_members where user_id = auth.uid() and status = 'active');
$$;
revoke all on function on_a_team() from public, anon;
grant execute on function on_a_team() to authenticated, service_role;

-- Teams where I manage Outliers: masters and researchers.
create or replace function my_outlier_team_ids()
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select distinct tm.team_id
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
   where tm.user_id = auth.uid() and tm.status = 'active' and mr.role in ('master', 'researcher');
$$;
revoke all on function my_outlier_team_ids() from public, anon;
grant execute on function my_outlier_team_ids() to authenticated, service_role;

-- A video's words for searching: its title and tags (an index can use it).
create or replace function outlier_doc(p_title text, p_tags text[])
returns tsvector
language sql
immutable
parallel safe
set search_path = public
as $$
  select to_tsvector('simple'::regconfig, coalesce(p_title, '') || ' ' || coalesce(array_to_string(p_tags, ' '), ''));
$$;

-- Words typed in a search box → "word1:* & word2:*" (letters and digits only,
-- so the query can never be malformed). Null when nothing is left.
create or replace function outlier_tsquery(p_q text)
returns tsquery
language sql
immutable
set search_path = public
as $$
  select case when s is null or s = '' then null else to_tsquery('simple'::regconfig, s) end
    from (
      select string_agg(quote_literal(w) || ':*', ' & ') as s
        from (
          select w from regexp_split_to_table(lower(coalesce(p_q, '')), '[^[:alnum:]]+') as w
           where w <> '' limit 12
        ) t
    ) x;
$$;

-- ---------------------------------------------------------------------------
-- 2. YouTube's public data (server writes, people on a team read)
-- ---------------------------------------------------------------------------
create table if not exists yt_channels (
  id text primary key check (id ~ '^UC[A-Za-z0-9_-]{22}$'),
  title text not null default '',
  handle text,
  avatar_url text,
  country text,
  lang text,
  description text,
  keywords text,
  published_at timestamptz,
  subscribers bigint,
  subs_hidden boolean not null default false,
  views bigint,
  video_count int,
  -- The channel's usual views (the median of its latest videos of each kind).
  long_median bigint,
  short_median bigint,
  long_n smallint not null default 0,
  short_n smallint not null default 0,
  uploads_week real,
  last_upload_at timestamptz,
  -- When its details / its uploads / its featured channels were last read.
  fetched_at timestamptz not null default now(),
  scanned_at timestamptz,
  featured_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists yt_channels_fetched_idx on yt_channels (fetched_at);
create index if not exists yt_channels_scanned_idx on yt_channels (scanned_at nulls first);

create table if not exists yt_videos (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text not null references yt_channels(id) on delete cascade,
  title text not null default '',
  -- The first 300 characters (chapters are counted from the whole text).
  description text,
  tags text[],
  category smallint,
  lang text,
  published_at timestamptz not null,
  duration_s int,
  kind text not null default 'long' check (kind in ('long', 'short', 'live')),
  hd boolean,
  captions boolean,
  licensed boolean,
  kids boolean,
  chapters smallint,
  views bigint,
  likes bigint,
  comments bigint,
  -- ClipTroop's numbers: × the channel's usual, the projection for a young
  -- video, views per hour lately.
  score real,
  projected real,
  vph real,
  -- The formats its title matches and its title's traits (fmt_v: which
  -- version of the detectors set them; older ones are worked out again).
  formats text[] not null default '{}',
  bits int not null default 0,
  fmt_v smallint not null default 0,
  -- Its thumbnail: a 64-bit picture fingerprint, main colours, brightness, colourfulness.
  thumb_hash text,
  thumb_colors text[],
  thumb_lum smallint,
  thumb_sat smallint,
  thumb_at timestamptz,
  stats_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists yt_videos_channel_idx on yt_videos (channel_id, kind, published_at desc);
create index if not exists yt_videos_published_idx on yt_videos (published_at desc);
create index if not exists yt_videos_fetched_idx on yt_videos (fetched_at);
create index if not exists yt_videos_doc_idx on yt_videos using gin (outlier_doc(title, tags));
create index if not exists yt_videos_formats_idx on yt_videos using gin (formats);

create table if not exists yt_video_stats (
  video_id text not null references yt_videos(id) on delete cascade,
  at timestamptz not null,
  views bigint,
  likes bigint,
  comments bigint,
  primary key (video_id, at)
);
create index if not exists yt_video_stats_at_idx on yt_video_stats (at);

create table if not exists yt_video_changes (
  id bigint generated always as identity primary key,
  video_id text not null references yt_videos(id) on delete cascade,
  at timestamptz not null default now(),
  field text not null check (field in ('title', 'thumbnail')),
  before text,
  after text,
  views bigint
);
create index if not exists yt_video_changes_video_idx on yt_video_changes (video_id, at desc);
create index if not exists yt_video_changes_at_idx on yt_video_changes (at);

alter table yt_channels enable row level security;
alter table yt_videos enable row level security;
alter table yt_video_stats enable row level security;
alter table yt_video_changes enable row level security;
revoke all on yt_channels, yt_videos, yt_video_stats, yt_video_changes from anon, authenticated;
grant select on yt_channels, yt_videos, yt_video_stats, yt_video_changes to authenticated;

drop policy if exists "people on a team read youtube channels" on yt_channels;
create policy "people on a team read youtube channels" on yt_channels for select to authenticated using ((select on_a_team()));
drop policy if exists "people on a team read youtube videos" on yt_videos;
create policy "people on a team read youtube videos" on yt_videos for select to authenticated using ((select on_a_team()));
drop policy if exists "people on a team read youtube views over time" on yt_video_stats;
create policy "people on a team read youtube views over time" on yt_video_stats for select to authenticated using ((select on_a_team()));
drop policy if exists "people on a team read youtube changes" on yt_video_changes;
create policy "people on a team read youtube changes" on yt_video_changes for select to authenticated using ((select on_a_team()));

-- ---------------------------------------------------------------------------
-- 3. Niches
-- ---------------------------------------------------------------------------
create table if not exists outlier_niches (
  id uuid primary key default gen_random_uuid(),
  -- Null: one of the built-in explore niches (slug = its key in the code).
  team_id uuid references teams(id) on delete cascade,
  slug text unique,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'blue' check (color ~ '^[a-z]{2,12}$'),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 12),
  exclude_words text[] not null default '{}' check (cardinality(exclude_words) <= 30),
  lang text check (lang is null or lang ~ '^[a-z]{2}$'),
  region text check (region is null or region ~ '^[A-Z]{2}$'),
  kinds text[] not null default '{long,short}' check (kinds <@ array['long', 'short']::text[] and cardinality(kinds) between 1 and 2),
  position int not null default 0,
  -- Worked out by the server from the niche's videos (formats, keywords, words, title traits…).
  insights jsonb,
  insights_at timestamptz,
  -- The collector's plan and progress (server only).
  crawl jsonb not null default '{}'::jsonb,
  crawled_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists outlier_niches_team_idx on outlier_niches (team_id, position);

-- Names, keywords and words to leave out tidied up; at most 12 niches a team;
-- the team never changes; whoever made it is recorded.
create or replace function outlier_niche_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.keywords := coalesce((
    select array_agg(k order by first)
      from (
        select k, min(o) as first
          from unnest(new.keywords) with ordinality as u(raw, o),
               lateral (select lower(btrim(regexp_replace(raw, '\s+', ' ', 'g'))) as k) t
         where k <> '' and char_length(k) <= 60
         group by k
      ) z
  ), '{}');
  if cardinality(new.keywords) > 12 then
    new.keywords := new.keywords[1:12];
  end if;
  new.exclude_words := coalesce((
    select array_agg(distinct k)
      from unnest(new.exclude_words) as raw, lateral (select lower(btrim(raw)) as k) t
     where k <> '' and char_length(k) <= 40
  ), '{}');
  if tg_op = 'INSERT' then
    if new.team_id is not null then
      select count(*) into n from outlier_niches where team_id = new.team_id;
      if n >= 12 then
        raise exception 'A team can follow at most 12 niches.' using errcode = 'P0001';
      end if;
      if auth.uid() is not null then
        new.created_by := auth.uid();
      end if;
    end if;
  else
    new.team_id := old.team_id;
    new.slug := old.slug;
  end if;
  return new;
end;
$$;
drop trigger if exists outlier_niche_guard on outlier_niches;
create trigger outlier_niche_guard before insert or update on outlier_niches
for each row execute function outlier_niche_guard();

alter table outlier_niches enable row level security;
revoke all on outlier_niches from anon, authenticated;
grant select, delete on outlier_niches to authenticated;
grant insert (id, team_id, name, color, keywords, exclude_words, lang, region, kinds, position) on outlier_niches to authenticated;
grant update (name, color, keywords, exclude_words, lang, region, kinds, position) on outlier_niches to authenticated;

drop policy if exists "teammates see niches" on outlier_niches;
create policy "teammates see niches" on outlier_niches for select to authenticated
  using (team_id is null or team_id in (select my_team_ids()));
drop policy if exists "managers add niches" on outlier_niches;
create policy "managers add niches" on outlier_niches for insert to authenticated
  with check (team_id in (select my_outlier_team_ids()));
drop policy if exists "managers change niches" on outlier_niches;
create policy "managers change niches" on outlier_niches for update to authenticated
  using (team_id in (select my_outlier_team_ids()))
  with check (team_id in (select my_outlier_team_ids()));
drop policy if exists "managers remove niches" on outlier_niches;
create policy "managers remove niches" on outlier_niches for delete to authenticated
  using (team_id in (select my_outlier_team_ids()));

-- Channels that belong to a niche (no link to yt_channels on purpose: the
-- list stays while YouTube's data is refreshed or deleted).
create table if not exists outlier_niche_channels (
  niche_id uuid not null references outlier_niches(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  source text not null default 'search' check (source in ('search', 'seed', 'featured', 'manual')),
  -- How much of the channel is about the niche (0…1; null until its uploads were read).
  relevance real,
  hidden boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (niche_id, channel_id)
);
create index if not exists outlier_niche_channels_channel_idx on outlier_niche_channels (channel_id);
create index if not exists outlier_niche_channels_team_idx on outlier_niche_channels (team_id);

alter table outlier_niche_channels enable row level security;
revoke all on outlier_niche_channels from anon, authenticated;
grant select on outlier_niche_channels to authenticated;
grant update (hidden) on outlier_niche_channels to authenticated;
drop policy if exists "teammates see niche channels" on outlier_niche_channels;
create policy "teammates see niche channels" on outlier_niche_channels for select to authenticated
  using (team_id is null or team_id in (select my_team_ids()));
drop policy if exists "managers hide niche channels" on outlier_niche_channels;
create policy "managers hide niche channels" on outlier_niche_channels for update to authenticated
  using (team_id in (select my_outlier_team_ids()))
  with check (team_id in (select my_outlier_team_ids()));

-- Videos a niche's searches found (from channels that aren't otherwise about it).
create table if not exists outlier_niche_hits (
  niche_id uuid not null references outlier_niches(id) on delete cascade,
  video_id text not null references yt_videos(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (niche_id, video_id)
);
create index if not exists outlier_niche_hits_video_idx on outlier_niche_hits (video_id);
alter table outlier_niche_hits enable row level security;
revoke all on outlier_niche_hits from anon, authenticated;
grant select on outlier_niche_hits to authenticated;
drop policy if exists "teammates see niche hits" on outlier_niche_hits;
create policy "teammates see niche hits" on outlier_niche_hits for select to authenticated
  using (niche_id in (select id from outlier_niches where team_id is null or team_id in (select my_team_ids())));

-- ---------------------------------------------------------------------------
-- 4. Tracked channels, saved things, hidden ideas, settings
-- ---------------------------------------------------------------------------
create table if not exists outlier_tracked (
  team_id uuid not null references teams(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (team_id, channel_id)
);
create index if not exists outlier_tracked_channel_idx on outlier_tracked (channel_id);

create or replace function outlier_tracked_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n from outlier_tracked where team_id = new.team_id;
  if n >= 200 then
    raise exception 'A team can track at most 200 channels.' using errcode = 'P0001';
  end if;
  if auth.uid() is not null then
    new.added_by := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists outlier_tracked_guard on outlier_tracked;
create trigger outlier_tracked_guard before insert on outlier_tracked
for each row execute function outlier_tracked_guard();

alter table outlier_tracked enable row level security;
revoke all on outlier_tracked from anon, authenticated;
grant select, delete on outlier_tracked to authenticated;
grant insert (team_id, channel_id) on outlier_tracked to authenticated;
drop policy if exists "teammates see tracked channels" on outlier_tracked;
create policy "teammates see tracked channels" on outlier_tracked for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "managers track channels" on outlier_tracked;
create policy "managers track channels" on outlier_tracked for insert to authenticated
  with check (team_id in (select my_outlier_team_ids()));
drop policy if exists "managers untrack channels" on outlier_tracked;
create policy "managers untrack channels" on outlier_tracked for delete to authenticated
  using (team_id in (select my_outlier_team_ids()));

create table if not exists outlier_folders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'amber' check (color ~ '^[a-z]{2,12}$'),
  position int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists outlier_folders_team_idx on outlier_folders (team_id, position);

create or replace function outlier_folder_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    select count(*) into n from outlier_folders where team_id = new.team_id;
    if n >= 60 then
      raise exception 'A team can have at most 60 folders.' using errcode = 'P0001';
    end if;
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.team_id := old.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists outlier_folder_guard on outlier_folders;
create trigger outlier_folder_guard before insert or update on outlier_folders
for each row execute function outlier_folder_guard();

alter table outlier_folders enable row level security;
revoke all on outlier_folders from anon, authenticated;
grant select on outlier_folders to authenticated;
grant insert (id, team_id, name, color, position) on outlier_folders to authenticated;
grant update (name, color, position) on outlier_folders to authenticated;
grant delete on outlier_folders to authenticated;
drop policy if exists "teammates see folders" on outlier_folders;
create policy "teammates see folders" on outlier_folders for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "teammates add folders" on outlier_folders;
create policy "teammates add folders" on outlier_folders for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "teammates change folders" on outlier_folders;
create policy "teammates change folders" on outlier_folders for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
-- Whoever made it, or a master.
drop policy if exists "makers and masters remove folders" on outlier_folders;
create policy "makers and masters remove folders" on outlier_folders for delete to authenticated
  using (team_id in (select my_team_ids()) and (created_by = (select auth.uid()) or team_id in (select my_master_team_ids())));

create table if not exists outlier_saves (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  folder_id uuid references outlier_folders(id) on delete set null,
  kind text not null check (kind in ('video', 'idea', 'channel')),
  video_id text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel_id text check (channel_id is null or channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  idea jsonb check (idea is null or pg_column_size(idea) <= 8192),
  note text check (note is null or char_length(note) <= 1000),
  -- What an idea became (set by the server when a video is started from it).
  project_id uuid references long_video_projects(id) on delete set null,
  short_id uuid references short_videos(id) on delete set null,
  saved_by uuid references profiles(id) on delete set null,
  saved_at timestamptz not null default now(),
  check ((kind = 'video') = (video_id is not null)),
  check ((kind = 'channel') = (channel_id is not null)),
  check ((kind = 'idea') = (idea is not null))
);
create index if not exists outlier_saves_team_idx on outlier_saves (team_id, saved_at desc);
create index if not exists outlier_saves_folder_idx on outlier_saves (folder_id);
create index if not exists outlier_saves_video_idx on outlier_saves (video_id) where video_id is not null;
create index if not exists outlier_saves_channel_idx on outlier_saves (channel_id) where channel_id is not null;
create unique index if not exists outlier_saves_video_once on outlier_saves (team_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), video_id) where video_id is not null;
create unique index if not exists outlier_saves_channel_once on outlier_saves (team_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), channel_id) where channel_id is not null;
create index if not exists outlier_saves_project_idx on outlier_saves (project_id) where project_id is not null;
create index if not exists outlier_saves_short_idx on outlier_saves (short_id) where short_id is not null;

create or replace function outlier_save_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  if tg_op = 'INSERT' then
    select count(*) into n from outlier_saves where team_id = new.team_id;
    if n >= 5000 then
      raise exception 'This team has saved 5,000 things: remove some first.' using errcode = 'P0001';
    end if;
    if auth.uid() is not null then
      new.saved_by := auth.uid();
    end if;
  else
    new.team_id := old.team_id;
    new.kind := old.kind;
  end if;
  -- A folder of another team can't hold it.
  if new.folder_id is not null and not exists (select 1 from outlier_folders f where f.id = new.folder_id and f.team_id = new.team_id) then
    raise exception 'That folder belongs to another team.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists outlier_save_guard on outlier_saves;
create trigger outlier_save_guard before insert or update on outlier_saves
for each row execute function outlier_save_guard();

alter table outlier_saves enable row level security;
revoke all on outlier_saves from anon, authenticated;
grant select, delete on outlier_saves to authenticated;
grant insert (id, team_id, folder_id, kind, video_id, channel_id, idea, note) on outlier_saves to authenticated;
grant update (folder_id, note) on outlier_saves to authenticated;
drop policy if exists "teammates see saved" on outlier_saves;
create policy "teammates see saved" on outlier_saves for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "teammates save" on outlier_saves;
create policy "teammates save" on outlier_saves for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "teammates change saved" on outlier_saves;
create policy "teammates change saved" on outlier_saves for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
drop policy if exists "teammates remove saved" on outlier_saves;
create policy "teammates remove saved" on outlier_saves for delete to authenticated
  using (team_id in (select my_team_ids()));

-- An idea started as a video: the save remembers which one (both in the
-- caller's team; nothing else about the save changes).
create or replace function outliers_link_idea(p_save uuid, p_project uuid default null, p_short uuid default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t uuid;
begin
  select s.team_id into t from outlier_saves s where s.id = p_save and s.kind = 'idea';
  if t is null or not exists (select 1 from my_team_ids() m where m = t) then
    return;
  end if;
  if p_project is not null and not exists (select 1 from long_video_projects p where p.id = p_project and p.team_id = t) then
    return;
  end if;
  if p_short is not null and not exists (select 1 from short_videos v where v.id = p_short and v.team_id = t) then
    return;
  end if;
  update outlier_saves set project_id = coalesce(p_project, project_id), short_id = coalesce(p_short, short_id) where id = p_save;
end;
$$;
revoke all on function outliers_link_idea(uuid, uuid, uuid) from public, anon;
grant execute on function outliers_link_idea(uuid, uuid, uuid) to authenticated;

-- Ideas (or videos) someone hid from their own suggestions.
create table if not exists outlier_dismissed (
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  at timestamptz not null default now(),
  primary key (user_id, team_id, key)
);
alter table outlier_dismissed enable row level security;
revoke all on outlier_dismissed from anon, authenticated;
grant select, delete on outlier_dismissed to authenticated;
grant insert (user_id, team_id, key) on outlier_dismissed to authenticated;
drop policy if exists "own hidden ideas" on outlier_dismissed;
create policy "own hidden ideas" on outlier_dismissed for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "hide ideas" on outlier_dismissed;
create policy "hide ideas" on outlier_dismissed for insert to authenticated
  with check (user_id = (select auth.uid()) and team_id in (select my_team_ids()));
drop policy if exists "unhide ideas" on outlier_dismissed;
create policy "unhide ideas" on outlier_dismissed for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists outlier_settings (
  team_id uuid primary key references teams(id) on delete cascade,
  -- Tell people when a tracked channel's new video reaches this many × its usual.
  alert_min real not null default 5 check (alert_min between 2 and 100),
  alert_to text not null default 'managers' check (alert_to in ('managers', 'everyone', 'off')),
  watch_words text[] not null default '{}' check (cardinality(watch_words) <= 20),
  digest boolean not null default true,
  -- Server only: the Monday summary went out (team's own day).
  digest_sent_on date,
  updated_at timestamptz not null default now()
);
create or replace function outlier_settings_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.watch_words := coalesce((
    select array_agg(distinct k)
      from unnest(new.watch_words) as raw, lateral (select lower(btrim(regexp_replace(raw, '\s+', ' ', 'g'))) as k) t
     where k <> '' and char_length(k) <= 60
  ), '{}');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.team_id := old.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists outlier_settings_guard on outlier_settings;
create trigger outlier_settings_guard before insert or update on outlier_settings
for each row execute function outlier_settings_guard();

alter table outlier_settings enable row level security;
revoke all on outlier_settings from anon, authenticated;
grant select on outlier_settings to authenticated;
grant insert (team_id, alert_min, alert_to, watch_words, digest) on outlier_settings to authenticated;
grant update (alert_min, alert_to, watch_words, digest) on outlier_settings to authenticated;
drop policy if exists "teammates see outlier settings" on outlier_settings;
create policy "teammates see outlier settings" on outlier_settings for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "masters add outlier settings" on outlier_settings;
create policy "masters add outlier settings" on outlier_settings for insert to authenticated
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters change outlier settings" on outlier_settings;
create policy "masters change outlier settings" on outlier_settings for update to authenticated
  using (team_id in (select my_master_team_ids()))
  with check (team_id in (select my_master_team_ids()));

-- ---------------------------------------------------------------------------
-- 5. Server only: budgets, live searches, announcements, combined insights
-- ---------------------------------------------------------------------------
create table if not exists outlier_quota (
  day date not null,
  bucket text not null check (bucket in ('search', 'units', 'stats')),
  used int not null default 0,
  primary key (day, bucket)
);
create table if not exists outlier_search_cache (
  key text primary key,
  q text not null,
  params jsonb not null default '{}'::jsonb,
  video_ids text[] not null default '{}',
  at timestamptz not null default now()
);
create index if not exists outlier_search_cache_at_idx on outlier_search_cache (at);
create table if not exists outlier_search_log (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  key text not null,
  q text not null,
  fresh boolean not null default true,
  at timestamptz not null default now()
);
create index if not exists outlier_search_log_team_idx on outlier_search_log (team_id, at desc);
create index if not exists outlier_search_log_user_idx on outlier_search_log (user_id, at desc);
create table if not exists outlier_alerts (
  team_id uuid not null references teams(id) on delete cascade,
  video_id text not null,
  kind text not null default 'tracked',
  at timestamptz not null default now(),
  primary key (team_id, video_id)
);
create index if not exists outlier_alerts_at_idx on outlier_alerts (at);
create table if not exists outlier_global (
  key text primary key,
  insights jsonb,
  at timestamptz not null default now()
);

alter table outlier_quota enable row level security;
alter table outlier_search_cache enable row level security;
alter table outlier_search_log enable row level security;
alter table outlier_alerts enable row level security;
alter table outlier_global enable row level security;
revoke all on outlier_quota, outlier_search_cache, outlier_search_log, outlier_alerts from anon, authenticated;
revoke all on outlier_global from anon, authenticated;
grant select on outlier_global to authenticated;
drop policy if exists "people on a team read combined insights" on outlier_global;
create policy "people on a team read combined insights" on outlier_global for select to authenticated using ((select on_a_team()));

-- One collector run at a time per team (and one for the explore niches):
-- outlier_lock(key, seconds) → true when this run got it (until it ends or
-- the seconds pass), false when another run holds it.
create table if not exists outlier_locks (
  key text primary key,
  until timestamptz not null
);
alter table outlier_locks enable row level security;
revoke all on outlier_locks from anon, authenticated;

create or replace function outlier_lock(p_key text, p_seconds int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  got text;
begin
  insert into outlier_locks (key, until) values (p_key, now() + make_interval(secs => least(greatest(p_seconds, 1), 600)))
  on conflict (key) do update set until = excluded.until where outlier_locks.until < now()
  returning key into got;
  return got is not null;
end;
$$;
revoke all on function outlier_lock(text, int) from public, anon, authenticated;
grant execute on function outlier_lock(text, int) to service_role;

create or replace function outlier_unlock(p_key text)
returns void
language sql
security definer set search_path = public
as $$
  delete from outlier_locks where key = p_key;
$$;
revoke all on function outlier_unlock(text) from public, anon, authenticated;
grant execute on function outlier_unlock(text) to service_role;

-- Takes `p_n` from today's `p_bucket` (YouTube's day: midnight Pacific time)
-- if that stays within `p_cap`. Returns what's left after taking, or -1 when
-- there wasn't enough (nothing is taken then).
create or replace function outlier_take(p_bucket text, p_n int, p_cap int)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  u int;
begin
  if p_n < 0 or p_cap < 0 then
    return -1;
  end if;
  insert into outlier_quota (day, bucket, used) values (d, p_bucket, 0) on conflict do nothing;
  update outlier_quota set used = used + p_n
   where day = d and bucket = p_bucket and used + p_n <= p_cap
  returning used into u;
  if u is null then
    return -1;
  end if;
  return p_cap - u;
end;
$$;
revoke all on function outlier_take(text, int, int) from public, anon, authenticated;
grant execute on function outlier_take(text, int, int) to service_role;

-- Today's use of each budget (YouTube's day).
create or replace function outlier_quota_today()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(bucket, used), '{}'::jsonb)
    from outlier_quota where day = (now() at time zone 'America/Los_Angeles')::date;
$$;
revoke all on function outlier_quota_today() from public, anon, authenticated;
grant execute on function outlier_quota_today() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Reading: videos with every filter, in one call
-- ---------------------------------------------------------------------------
-- The channels and videos a scope covers: one niche (a team's or an explore
-- one), every niche (the team's and the explore ones), the tracked channels,
-- one channel, or a list of video ids (a live search).
create or replace function outlier_scope(p_team uuid, p_niche uuid, p_f jsonb, out chans text[], out hits text[])
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_scope text := coalesce(p_f->>'scope', 'niche');
begin
  chans := '{}';
  hits := '{}';
  if p_f ? 'ids' then
    select coalesce(array_agg(x), '{}') into hits
      from (select jsonb_array_elements_text(p_f->'ids') as x limit 500) t
     where x ~ '^[A-Za-z0-9_-]{11}$';
    return;
  end if;
  if p_f ? 'channel' then
    if (p_f->>'channel') ~ '^UC[A-Za-z0-9_-]{22}$' then
      chans := array[p_f->>'channel'];
    end if;
    return;
  end if;
  if v_scope = 'tracked' then
    select coalesce(array_agg(channel_id), '{}') into chans from outlier_tracked where team_id = p_team;
    return;
  end if;
  select coalesce(array_agg(distinct nc.channel_id), '{}') into chans
    from outlier_niche_channels nc
    join outlier_niches n on n.id = nc.niche_id
   where (case when p_niche is not null then n.id = p_niche else (n.team_id = p_team or n.team_id is null) end)
     and not nc.hidden
     and (nc.relevance is null or nc.relevance >= 0.15 or nc.source in ('seed', 'manual'));
  select coalesce(array_agg(distinct h.video_id), '{}') into hits
    from outlier_niche_hits h
    join outlier_niches n on n.id = h.niche_id
   where (case when p_niche is not null then n.id = p_niche else (n.team_id = p_team or n.team_id is null) end);
end;
$$;
revoke all on function outlier_scope(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function outlier_scope(uuid, uuid, jsonb) to service_role;

-- Filters (p_f, all optional): scope, ids, channel, kind ('long' | 'short'),
-- min_score, max_score, min_views, max_views, min_subs, max_subs, days
-- (posted within), until_days (posted at least that long ago), min_dur,
-- max_dur (seconds), min_vph, min_eng (likes + comments per 100 views),
-- min_vps (views per subscriber), langs[], formats[] (any of), bits (every
-- one of these title traits), q (words), exclude_channels[], exclude_words[],
-- channel_days (the channel started within). Sorts: score, projected, views,
-- vph, newest, eng, vps, small (small channels first), oldest.
-- Each row carries its channel's videos around it (peers: views, oldest
-- first; peer_i: where this one is), for the little bars on every card.
-- (Dropped first: an earlier draft of this file returned fewer columns.)
drop function if exists outliers_videos(uuid, uuid, jsonb, text, int, int);
create or replace function outliers_videos(
  p_team uuid,
  p_niche uuid default null,
  p_f jsonb default '{}'::jsonb,
  p_sort text default 'score',
  p_limit int default 48,
  p_offset int default 0
)
returns table (
  id text,
  channel_id text,
  title text,
  published_at timestamptz,
  duration_s int,
  kind text,
  views bigint,
  likes bigint,
  comments bigint,
  score real,
  projected real,
  vph real,
  formats text[],
  lang text,
  thumb_colors text[],
  thumb_hash text,
  stats_at timestamptz,
  ch_title text,
  ch_handle text,
  ch_avatar text,
  ch_subs bigint,
  ch_usual bigint,
  ch_published_at timestamptz,
  peers bigint[],
  peer_i int,
  total bigint
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_chans text[];
  v_hits text[];
  v_where text := '';
  v_order text;
  v_sql text;
  v_q tsquery;
  v_qlike text;
begin
  if p_team is null or not is_team_member(p_team) then
    return;
  end if;
  if p_niche is not null and not exists (select 1 from outlier_niches n where n.id = p_niche and (n.team_id is null or n.team_id = p_team)) then
    return;
  end if;
  p_f := coalesce(p_f, '{}'::jsonb);
  p_limit := least(greatest(coalesce(p_limit, 48), 1), 200);
  p_offset := least(greatest(coalesce(p_offset, 0), 0), 20000);
  select s.chans, s.hits into v_chans, v_hits from outlier_scope(p_team, p_niche, p_f) s;
  if cardinality(v_chans) = 0 and cardinality(v_hits) = 0 then
    return;
  end if;

  if p_f->>'kind' in ('long', 'short') then v_where := v_where || ' and v.kind = $3'; else v_where := v_where || ' and v.kind <> ''live'''; end if;
  if p_f ? 'min_score' then v_where := v_where || ' and v.score >= $4'; end if;
  if p_f ? 'max_score' then v_where := v_where || ' and v.score <= $5'; end if;
  if p_f ? 'min_views' then v_where := v_where || ' and v.views >= $6'; end if;
  if p_f ? 'max_views' then v_where := v_where || ' and v.views <= $7'; end if;
  if p_f ? 'min_subs' then v_where := v_where || ' and c.subscribers >= $8'; end if;
  if p_f ? 'max_subs' then v_where := v_where || ' and c.subscribers <= $9'; end if;
  if p_f ? 'days' then v_where := v_where || ' and v.published_at >= now() - make_interval(days => $10)'; end if;
  if p_f ? 'until_days' then v_where := v_where || ' and v.published_at <= now() - make_interval(days => $11)'; end if;
  if p_f ? 'min_dur' then v_where := v_where || ' and v.duration_s >= $12'; end if;
  if p_f ? 'max_dur' then v_where := v_where || ' and v.duration_s <= $13'; end if;
  if p_f ? 'min_vph' then v_where := v_where || ' and v.vph >= $14'; end if;
  if p_f ? 'min_eng' then v_where := v_where || ' and (coalesce(v.likes, 0) + coalesce(v.comments, 0))::real * 100 / nullif(v.views, 0) >= $15'; end if;
  if p_f ? 'min_vps' then v_where := v_where || ' and v.views::real / nullif(c.subscribers, 0) >= $16'; end if;
  if jsonb_typeof(p_f->'langs') = 'array' and jsonb_array_length(p_f->'langs') > 0 then v_where := v_where || ' and v.lang = any($17)'; end if;
  if jsonb_typeof(p_f->'formats') = 'array' and jsonb_array_length(p_f->'formats') > 0 then v_where := v_where || ' and v.formats && $18'; end if;
  if coalesce((p_f->>'bits')::int, 0) > 0 then v_where := v_where || ' and (v.bits & $19) = $19'; end if;
  if nullif(btrim(p_f->>'q'), '') is not null then
    v_q := outlier_tsquery(p_f->>'q');
    v_qlike := '%' || replace(replace(replace(lower(btrim(p_f->>'q')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if v_q is not null then
      v_where := v_where || ' and (outlier_doc(v.title, v.tags) @@ $20 or lower(c.title) like $21)';
    else
      v_where := v_where || ' and (lower(v.title) like $21 or lower(c.title) like $21)';
    end if;
  end if;
  if jsonb_typeof(p_f->'exclude_channels') = 'array' and jsonb_array_length(p_f->'exclude_channels') > 0 then v_where := v_where || ' and not (v.channel_id = any($22))'; end if;
  if jsonb_typeof(p_f->'exclude_words') = 'array' and jsonb_array_length(p_f->'exclude_words') > 0 then
    v_where := v_where || ' and not exists (select 1 from unnest($23) w where w <> '''' and strpos(lower(v.title), w) > 0)';
  end if;
  if p_f ? 'channel_days' then v_where := v_where || ' and c.published_at >= now() - make_interval(days => $24)'; end if;

  v_order := case p_sort
    when 'projected' then 'coalesce(v.projected, v.score) desc nulls last, v.views desc nulls last'
    when 'views' then 'v.views desc nulls last'
    when 'vph' then 'coalesce(v.vph, 0) desc, v.views desc nulls last'
    when 'newest' then 'v.published_at desc'
    when 'oldest' then 'v.published_at asc'
    when 'eng' then '(coalesce(v.likes, 0) + coalesce(v.comments, 0))::real / nullif(v.views, 0) desc nulls last'
    when 'vps' then 'v.views::real / nullif(c.subscribers, 0) desc nulls last'
    when 'small' then 'c.subscribers asc nulls last, v.score desc nulls last'
    else 'v.score desc nulls last, v.views desc nulls last'
  end;

  v_sql := format($q$
    with page as (
      select v.id, v.channel_id, v.title, v.published_at, v.duration_s, v.kind, v.views, v.likes, v.comments,
             v.score, v.projected, v.vph, v.formats, v.lang, v.thumb_colors, v.thumb_hash, v.stats_at,
             c.title as ch_title, c.handle as ch_handle, c.avatar_url as ch_avatar, c.subscribers as ch_subs,
             case when v.kind = 'short' then c.short_median else c.long_median end as ch_usual,
             c.published_at as ch_published_at,
             count(*) over () as total,
             row_number() over (order by %1$s, v.id) as rn
        from yt_videos v
        join yt_channels c on c.id = v.channel_id
       where (v.channel_id = any($1) or v.id = any($2)) %2$s
       order by %1$s, v.id
       limit $25 offset $26
    )
    select p.id, p.channel_id, p.title, p.published_at, p.duration_s, p.kind, p.views, p.likes, p.comments,
           p.score, p.projected, p.vph, p.formats, p.lang, p.thumb_colors, p.thumb_hash, p.stats_at,
           p.ch_title, p.ch_handle, p.ch_avatar, p.ch_subs, p.ch_usual, p.ch_published_at,
           pe.peers, pe.peer_i, p.total
      from page p
      left join lateral (
        select array_agg(x.views order by x.published_at, x.id) as peers,
               array_position(array_agg(x.id order by x.published_at, x.id), p.id) as peer_i
          from (
            (select b.id, b.views, b.published_at from yt_videos b
              where b.channel_id = p.channel_id and b.kind = p.kind and b.published_at < p.published_at
              order by b.published_at desc limit 8)
            union all
            select p.id, p.views, p.published_at
            union all
            (select a.id, a.views, a.published_at from yt_videos a
              where a.channel_id = p.channel_id and a.kind = p.kind and a.published_at > p.published_at
              order by a.published_at asc limit 3)
          ) x
      ) pe on true
     order by p.rn
  $q$, v_order, v_where);

  return query execute v_sql using
    v_chans, v_hits,
    p_f->>'kind',
    (p_f->>'min_score')::real, (p_f->>'max_score')::real,
    (p_f->>'min_views')::bigint, (p_f->>'max_views')::bigint,
    (p_f->>'min_subs')::bigint, (p_f->>'max_subs')::bigint,
    least(greatest(coalesce((p_f->>'days')::int, 0), 0), 36500), least(greatest(coalesce((p_f->>'until_days')::int, 0), 0), 36500),
    (p_f->>'min_dur')::int, (p_f->>'max_dur')::int,
    (p_f->>'min_vph')::real, (p_f->>'min_eng')::real, (p_f->>'min_vps')::real,
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(p_f->'langs') = 'array' then p_f->'langs' else '[]'::jsonb end) x),
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(p_f->'formats') = 'array' then p_f->'formats' else '[]'::jsonb end) x),
    coalesce((p_f->>'bits')::int, 0),
    v_q, v_qlike,
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(p_f->'exclude_channels') = 'array' then p_f->'exclude_channels' else '[]'::jsonb end) x),
    (select coalesce(array_agg(lower(x)), '{}') from jsonb_array_elements_text(case when jsonb_typeof(p_f->'exclude_words') = 'array' then p_f->'exclude_words' else '[]'::jsonb end) x),
    least(greatest(coalesce((p_f->>'channel_days')::int, 0), 0), 36500),
    p_limit, p_offset;
end;
$$;
revoke all on function outliers_videos(uuid, uuid, jsonb, text, int, int) from public, anon;
grant execute on function outliers_videos(uuid, uuid, jsonb, text, int, int) to authenticated, service_role;

-- The channels of a niche (or every niche, or the tracked ones), with how
-- they do: videos stored, how many were 3× or more, their best, and more.
-- Filters: min_subs, max_subs, min_rate (share of outliers, 0…1), active_days
-- (posted within), channel_days (started within), q, tracked (only those),
-- hidden (show the ones taken out of the niche instead). Sorts: rate, best,
-- subs, small, uploads, recent, newest.
create or replace function outliers_channels(
  p_team uuid,
  p_niche uuid default null,
  p_f jsonb default '{}'::jsonb,
  p_sort text default 'rate',
  p_limit int default 60,
  p_offset int default 0
)
returns table (
  id text,
  title text,
  handle text,
  avatar_url text,
  country text,
  published_at timestamptz,
  subscribers bigint,
  views bigint,
  video_count int,
  long_median bigint,
  short_median bigint,
  uploads_week real,
  last_upload_at timestamptz,
  stored int,
  outliers int,
  best real,
  best_video text,
  tracked boolean,
  source text,
  relevance real,
  hidden boolean,
  total bigint
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_hidden boolean := coalesce((p_f->>'hidden')::boolean, false);
  v_tracked boolean := coalesce((p_f->>'tracked')::boolean, false) or coalesce(p_f->>'scope' = 'tracked', false);
  v_q text := nullif(lower(btrim(p_f->>'q')), '');
begin
  if p_team is null or not is_team_member(p_team) then
    return;
  end if;
  if p_niche is not null and not exists (select 1 from outlier_niches n where n.id = p_niche and (n.team_id is null or n.team_id = p_team)) then
    return;
  end if;
  p_f := coalesce(p_f, '{}'::jsonb);
  p_limit := least(greatest(coalesce(p_limit, 60), 1), 300);
  p_offset := least(greatest(coalesce(p_offset, 0), 0), 20000);
  return query
  with members as (
    select nc.channel_id, min(nc.source) as source, max(nc.relevance) as relevance, bool_and(nc.hidden) as hidden
      from outlier_niche_channels nc
      join outlier_niches n on n.id = nc.niche_id
     where not v_tracked
       and (case when p_niche is not null then n.id = p_niche else (n.team_id = p_team or n.team_id is null) end)
     group by nc.channel_id
    union all
    select t.channel_id, 'tracked', null, false from outlier_tracked t where v_tracked and t.team_id = p_team
  ),
  picked as (
    select m.* from members m
     where (v_tracked or m.hidden = v_hidden)
       and (v_tracked or v_hidden or m.relevance is null or m.relevance >= 0.15 or m.source in ('seed', 'manual'))
  ),
  agg as (
    select v.channel_id,
           count(*)::int as stored,
           count(*) filter (where v.score >= 3)::int as outliers,
           max(v.score) as best,
           (array_agg(v.id order by v.score desc nulls last))[1] as best_video
      from yt_videos v
     where v.channel_id in (select channel_id from picked) and v.kind <> 'live'
     group by v.channel_id
  ),
  rows as (
    select c.id, c.title, c.handle, c.avatar_url, c.country, c.published_at, c.subscribers, c.views, c.video_count,
           c.long_median, c.short_median, c.uploads_week, c.last_upload_at,
           coalesce(a.stored, 0) as stored, coalesce(a.outliers, 0) as outliers, a.best, a.best_video,
           exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = c.id) as tracked,
           p.source, p.relevance, p.hidden
      from picked p
      join yt_channels c on c.id = p.channel_id
      left join agg a on a.channel_id = c.id
     where (not (p_f ? 'min_subs') or c.subscribers >= (p_f->>'min_subs')::bigint)
       and (not (p_f ? 'max_subs') or c.subscribers <= (p_f->>'max_subs')::bigint)
       and (not (p_f ? 'min_rate') or coalesce(a.outliers::real / nullif(a.stored, 0), 0) >= (p_f->>'min_rate')::real)
       and (not (p_f ? 'active_days') or c.last_upload_at >= now() - make_interval(days => least(greatest((p_f->>'active_days')::int, 1), 36500)))
       and (not (p_f ? 'channel_days') or c.published_at >= now() - make_interval(days => least(greatest((p_f->>'channel_days')::int, 1), 36500)))
       and (v_q is null or lower(c.title) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' or lower(coalesce(c.handle, '')) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select r.id, r.title, r.handle, r.avatar_url, r.country, r.published_at, r.subscribers, r.views, r.video_count,
         r.long_median, r.short_median, r.uploads_week, r.last_upload_at, r.stored, r.outliers, r.best, r.best_video,
         r.tracked, r.source, r.relevance, r.hidden, count(*) over () as total
    from rows r
   order by
     case when p_sort = 'best' then r.best end desc nulls last,
     case when p_sort = 'subs' then r.subscribers end desc nulls last,
     case when p_sort = 'small' then r.subscribers end asc nulls last,
     case when p_sort = 'uploads' then r.uploads_week end desc nulls last,
     case when p_sort = 'recent' then r.last_upload_at end desc nulls last,
     case when p_sort = 'newest' then r.published_at end desc nulls last,
     case when p_sort not in ('best', 'subs', 'small', 'uploads', 'recent', 'newest') then r.outliers::real / nullif(r.stored, 0) end desc nulls last,
     r.best desc nulls last, r.id
   limit p_limit offset p_offset;
end;
$$;
revoke all on function outliers_channels(uuid, uuid, jsonb, text, int, int) from public, anon;
grant execute on function outliers_channels(uuid, uuid, jsonb, text, int, int) to authenticated, service_role;

-- One video with everything its panel shows.
create or replace function outliers_video(p_team uuid, p_video text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v yt_videos;
  c yt_channels;
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  select * into v from yt_videos where id = p_video;
  if not found then
    return null;
  end if;
  select * into c from yt_channels where id = v.channel_id;
  return jsonb_build_object(
    'video', to_jsonb(v) - 'fmt_v',
    'channel', to_jsonb(c),
    'peers', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'views', x.views, 'score', x.score, 'published_at', x.published_at) order by x.published_at)
        from (
          select b.id, b.title, b.views, b.score, b.published_at from yt_videos b
           where b.channel_id = v.channel_id and b.kind = v.kind
           order by abs(extract(epoch from (b.published_at - v.published_at))) asc
           limit 41
        ) x
    ), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(jsonb_build_object('at', s.at, 'views', s.views, 'likes', s.likes, 'comments', s.comments) order by s.at) from yt_video_stats s where s.video_id = v.id), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('at', ch.at, 'field', ch.field, 'before', ch.before, 'after', ch.after, 'views', ch.views) order by ch.at desc) from yt_video_changes ch where ch.video_id = v.id), '[]'::jsonb),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folder_id', s.folder_id)) from outlier_saves s where s.team_id = p_team and s.video_id = v.id), '[]'::jsonb),
    'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = v.channel_id),
    'niches', coalesce((
      select jsonb_agg(distinct n.id)
        from outlier_niches n
       where (n.team_id = p_team or n.team_id is null)
         and (exists (select 1 from outlier_niche_channels nc where nc.niche_id = n.id and nc.channel_id = v.channel_id and not nc.hidden)
              or exists (select 1 from outlier_niche_hits h where h.niche_id = n.id and h.video_id = v.id))
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function outliers_video(uuid, text) from public, anon;
grant execute on function outliers_video(uuid, text) to authenticated, service_role;

-- One channel with its latest videos of each kind.
create or replace function outliers_channel(p_team uuid, p_channel text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c yt_channels;
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  select * into c from yt_channels where id = p_channel;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'channel', to_jsonb(c),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'title', x.title, 'views', x.views, 'likes', x.likes, 'comments', x.comments, 'score', x.score, 'projected', x.projected,
               'published_at', x.published_at, 'duration_s', x.duration_s, 'kind', x.kind, 'formats', x.formats, 'vph', x.vph
             ) order by x.published_at desc)
        from (
          (select * from yt_videos where channel_id = c.id and kind = 'long' order by published_at desc limit 60)
          union all
          (select * from yt_videos where channel_id = c.id and kind = 'short' order by published_at desc limit 60)
        ) x
    ), '[]'::jsonb),
    'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = c.id),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folder_id', s.folder_id)) from outlier_saves s where s.team_id = p_team and s.channel_id = c.id), '[]'::jsonb),
    'niches', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'team', n.team_id is not null, 'source', nc.source, 'relevance', nc.relevance, 'hidden', nc.hidden))
        from outlier_niche_channels nc join outlier_niches n on n.id = nc.niche_id
       where nc.channel_id = c.id and (n.team_id = p_team or n.team_id is null)
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function outliers_channel(uuid, text) from public, anon;
grant execute on function outliers_channel(uuid, text) to authenticated, service_role;

-- The page's header and settings: the team's niches (with the collector's
-- counts), the explore niches, tracked channels, folders, settings.
create or replace function outliers_overview(p_team uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if p_team is null or not is_team_member(p_team) then
    return null;
  end if;
  return jsonb_build_object(
    'niches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'name', n.name, 'color', n.color, 'keywords', n.keywords, 'exclude_words', n.exclude_words,
               'lang', n.lang, 'region', n.region, 'kinds', n.kinds, 'position', n.position,
               'crawled_at', n.crawled_at, 'insights_at', n.insights_at, 'created_at', n.created_at,
               'counts', n.crawl->'counts', 'note', n.crawl->>'note', 'phase', n.crawl->>'phase'
             ) order by n.position, n.created_at)
        from outlier_niches n where n.team_id = p_team
    ), '[]'::jsonb),
    'explore', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'slug', n.slug, 'name', n.name, 'color', n.color, 'counts', n.crawl->'counts', 'crawled_at', n.crawled_at) order by n.name)
        from outlier_niches n where n.team_id is null
    ), '[]'::jsonb),
    'tracked', coalesce((select jsonb_agg(t.channel_id order by t.added_at desc) from outlier_tracked t where t.team_id = p_team), '[]'::jsonb),
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'color', f.color, 'position', f.position, 'created_by', f.created_by,
               'count', (select count(*) from outlier_saves s where s.folder_id = f.id)) order by f.position, f.created_at)
        from outlier_folders f where f.team_id = p_team
    ), '[]'::jsonb),
    'saved', (select count(*) from outlier_saves s where s.team_id = p_team),
    'unsorted', (select count(*) from outlier_saves s where s.team_id = p_team and s.folder_id is null),
    -- What's saved where (the newest 3,000): [video or channel id, folder id, save id], so every card shows it.
    'saves', coalesce((
      select jsonb_agg(jsonb_build_array(x.ref, x.folder_id, x.id))
        from (select coalesce(s.video_id, s.channel_id) as ref, s.folder_id, s.id
                from outlier_saves s
               where s.team_id = p_team and s.kind in ('video', 'channel')
               order by s.saved_at desc limit 3000) x
    ), '[]'::jsonb),
    'settings', (select to_jsonb(st) - 'team_id' from outlier_settings st where st.team_id = p_team)
  );
end;
$$;
revoke all on function outliers_overview(uuid) from public, anon;
grant execute on function outliers_overview(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The collector's side (service role only)
-- ---------------------------------------------------------------------------
drop function if exists outliers_corpus(uuid, int);
-- A niche's videos, small, for working out its insights (or every explore
-- niche's at once when p_niche is null): one JSON array of arrays (a single
-- answer, so the API's row limit doesn't cut it), newest first:
-- [id, channel_id, title, kind, published_at, views, score, duration_s, lang,
--  formats, bits, thumb_colors, thumb_lum, thumb_sat, subscribers].
create or replace function outliers_corpus(p_niche uuid, p_limit int default 30000)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with niches as (
    select n.id from outlier_niches n where (p_niche is not null and n.id = p_niche) or (p_niche is null and n.team_id is null)
  ),
  chans as (
    select distinct nc.channel_id from outlier_niche_channels nc
     where nc.niche_id in (select id from niches) and not nc.hidden
       and (nc.relevance is null or nc.relevance >= 0.15 or nc.source in ('seed', 'manual'))
  ),
  hits as (
    select distinct h.video_id from outlier_niche_hits h where h.niche_id in (select id from niches)
  ),
  picked as (
    select v.id, v.channel_id, v.title, v.kind, v.published_at, v.views, v.score, v.duration_s, v.lang,
           v.formats, v.bits, v.thumb_colors, v.thumb_lum, v.thumb_sat, c.subscribers
      from yt_videos v join yt_channels c on c.id = v.channel_id
     where (v.channel_id in (select channel_id from chans) or v.id in (select video_id from hits))
       and v.kind <> 'live'
     order by v.published_at desc
     limit least(greatest(coalesce(p_limit, 30000), 1), 100000)
  )
  select coalesce(jsonb_agg(jsonb_build_array(id, channel_id, title, kind, published_at, views, score, duration_s, lang, formats, bits, thumb_colors, thumb_lum, thumb_sat, subscribers)), '[]'::jsonb)
    from picked;
$$;
revoke all on function outliers_corpus(uuid, int) from public, anon, authenticated;
grant execute on function outliers_corpus(uuid, int) to service_role;

-- Channels whose uploads are due to be read, most urgent first: tracked
-- channels every 6 hours, a niche's channels that were never read, then a
-- team's niche channels daily (every 3 days when quiet or barely about the
-- niche), the explore niches' every 10 days. p_team null = the explore niches.
create or replace function outliers_due_channels(p_team uuid, p_limit int default 40)
returns table (channel_id text, reason text)
language sql
stable
security definer set search_path = public
as $$
  with candidates as (
    select t.channel_id, 0 as pri, 'tracked'::text as reason, interval '6 hours' as every
      from outlier_tracked t where p_team is not null and t.team_id = p_team
    union all
    select nc.channel_id,
           case when c.scanned_at is null then 1 else 2 end,
           'niche',
           case
             when n.team_id is null then interval '10 days'
             when coalesce(nc.relevance, 1) < 0.15 then interval '14 days'
             when c.last_upload_at is null or c.last_upload_at < now() - interval '30 days' then interval '3 days'
             else interval '1 day'
           end
      from outlier_niche_channels nc
      join outlier_niches n on n.id = nc.niche_id
      left join yt_channels c on c.id = nc.channel_id
     where not nc.hidden
       and ((p_team is not null and n.team_id = p_team) or (p_team is null and n.team_id is null))
  ),
  best as (
    select x.channel_id, min(x.pri) as pri, min(x.every) as every, (array_agg(x.reason order by x.pri))[1] as reason
      from candidates x group by x.channel_id
  )
  select b.channel_id, b.reason
    from best b
    left join yt_channels c on c.id = b.channel_id
   where c.id is null or c.scanned_at is null or c.scanned_at < now() - b.every
   order by b.pri, c.scanned_at nulls first
   limit least(greatest(coalesce(p_limit, 40), 1), 500);
$$;
revoke all on function outliers_due_channels(uuid, int) from public, anon, authenticated;
grant execute on function outliers_due_channels(uuid, int) to service_role;

-- Videos whose numbers are due (young ones often, for views per hour and
-- "rising now"; the rest of a team's tracked and saved videos daily), and
-- videos whose details must be read again before YouTube's 30 days run out
-- (every video a team or the explore niches keep, after 22 days).
create or replace function outliers_due_videos(p_team uuid, p_limit int default 500)
returns table (video_id text, reason text)
language sql
stable
security definer set search_path = public
as $$
  with niches as (
    select n.id from outlier_niches n where (p_team is not null and n.team_id = p_team) or (p_team is null and n.team_id is null)
  ),
  chans as (
    select distinct nc.channel_id from outlier_niche_channels nc where nc.niche_id in (select id from niches) and not nc.hidden
    union
    select t.channel_id from outlier_tracked t where p_team is not null and t.team_id = p_team
  ),
  saved as (
    select s.video_id from outlier_saves s where p_team is not null and s.team_id = p_team and s.video_id is not null
  ),
  pool as (
    select v.id, v.published_at, v.stats_at, v.fetched_at, (v.id in (select video_id from saved)) as kept
      from yt_videos v
     where v.channel_id in (select channel_id from chans) or v.id in (select video_id from saved)
        or v.id in (select h.video_id from outlier_niche_hits h where h.niche_id in (select id from niches))
  )
  select p.id,
         case when p.fetched_at < now() - interval '22 days' then 'details' else 'stats' end
    from pool p
   where p.fetched_at < now() - interval '22 days'
      or (p.published_at > now() - interval '3 days' and (p.stats_at is null or p.stats_at < now() - interval '2 hours'))
      or (p.published_at > now() - interval '14 days' and (p.stats_at is null or p.stats_at < now() - interval '12 hours'))
      or (p.kept and (p.stats_at is null or p.stats_at < now() - interval '1 day'))
   order by (p.fetched_at < now() - interval '22 days') desc, p.published_at desc
   limit least(greatest(coalesce(p_limit, 500), 1), 5000);
$$;
revoke all on function outliers_due_videos(uuid, int) from public, anon, authenticated;
grant execute on function outliers_due_videos(uuid, int) to service_role;

-- New outliers a team should hear about: tracked channels' videos from the
-- last 3 days at `p_min`× or more (or heading there), and, for the watch
-- words, the team's niches' videos too. Each video once per team.
create or replace function outliers_alert_candidates(p_team uuid, p_min real, p_words text[])
returns table (video_id text, channel_id text, title text, score real, projected real, views bigint, why text, word text)
language sql
stable
security definer set search_path = public
as $$
  with niches as (select n.id from outlier_niches n where n.team_id = p_team),
  niche_chans as (
    select distinct nc.channel_id from outlier_niche_channels nc where nc.niche_id in (select id from niches) and not nc.hidden
  ),
  fresh as (
    select v.* from yt_videos v
     where v.published_at > now() - interval '3 days'
       and v.kind <> 'live'
       and greatest(coalesce(v.score, 0), coalesce(v.projected, 0)) >= p_min
       and not exists (select 1 from outlier_alerts a where a.team_id = p_team and a.video_id = v.id)
  )
  select f.id, f.channel_id, f.title, f.score, f.projected, f.views, 'tracked', null::text
    from fresh f where f.channel_id in (select channel_id from outlier_tracked where team_id = p_team)
  union all
  select f.id, f.channel_id, f.title, f.score, f.projected, f.views, 'word', m.w
    from fresh f
    cross join lateral (select w from unnest(coalesce(p_words, '{}')) w where w <> '' and strpos(lower(f.title), w) > 0 limit 1) m
   where f.channel_id in (select channel_id from niche_chans)
     and f.channel_id not in (select channel_id from outlier_tracked where team_id = p_team);
$$;
revoke all on function outliers_alert_candidates(uuid, real, text[]) from public, anon, authenticated;
grant execute on function outliers_alert_candidates(uuid, real, text[]) to service_role;

-- The collector's bulk updates (one call each instead of one per row).
-- Scores, projections and views per hour: [{id, score, projected, vph}].
create or replace function outliers_set_scores(p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(id text, score real, projected real, vph real)
  ), u as (
    update yt_videos v set score = x.score, projected = x.projected, vph = coalesce(x.vph, v.vph)
      from x where v.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_scores(jsonb) from public, anon, authenticated;
grant execute on function outliers_set_scores(jsonb) to service_role;

-- Fresh counts: [{id, views, likes, comments, projected, vph}] (stats_at = now).
create or replace function outliers_set_stats(p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(id text, views bigint, likes bigint, comments bigint, score real, projected real, vph real)
  ), u as (
    update yt_videos v set views = coalesce(x.views, v.views), likes = coalesce(x.likes, v.likes), comments = coalesce(x.comments, v.comments),
                           score = coalesce(x.score, v.score), projected = x.projected, vph = coalesce(x.vph, v.vph), stats_at = now()
      from x where v.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_stats(jsonb) from public, anon, authenticated;
grant execute on function outliers_set_stats(jsonb) to service_role;

-- Thumbnail numbers: [{id, hash, colors, lum, sat}] (thumb_at = now; a failed picture still gets thumb_at, with nulls).
create or replace function outliers_set_thumbs(p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(id text, hash text, colors text[], lum smallint, sat smallint)
  ), u as (
    update yt_videos v set thumb_hash = x.hash, thumb_colors = x.colors, thumb_lum = x.lum, thumb_sat = x.sat, thumb_at = now()
      from x where v.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_thumbs(jsonb) from public, anon, authenticated;
grant execute on function outliers_set_thumbs(jsonb) to service_role;

-- Formats and title traits worked out again by newer detectors: [{id, formats, bits, v}].
create or replace function outliers_set_formats(p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(id text, formats text[], bits int, v smallint)
  ), u as (
    update yt_videos y set formats = coalesce(x.formats, '{}'), bits = coalesce(x.bits, 0), fmt_v = x.v
      from x where y.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_formats(jsonb) from public, anon, authenticated;
grant execute on function outliers_set_formats(jsonb) to service_role;

-- How much of each channel is about a niche: [{channel_id, relevance}].
create or replace function outliers_set_relevance(p_niche uuid, p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(channel_id text, relevance real)
  ), u as (
    update outlier_niche_channels nc set relevance = x.relevance
      from x where nc.niche_id = p_niche and nc.channel_id = x.channel_id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_relevance(uuid, jsonb) from public, anon, authenticated;
grant execute on function outliers_set_relevance(uuid, jsonb) to service_role;

-- Videos of a scope (a team's niches, tracked and saved; or the explore
-- niches) whose thumbnails haven't been looked at, best first.
create or replace function outliers_due_thumbs(p_team uuid, p_limit int default 60, p_min real default 0)
returns table (video_id text, kind text)
language sql
stable
security definer set search_path = public
as $$
  with niches as (
    select n.id from outlier_niches n where (p_team is not null and n.team_id = p_team) or (p_team is null and n.team_id is null)
  ),
  chans as (
    select distinct nc.channel_id from outlier_niche_channels nc where nc.niche_id in (select id from niches) and not nc.hidden
    union
    select t.channel_id from outlier_tracked t where p_team is not null and t.team_id = p_team
  )
  select v.id, v.kind from yt_videos v
   where v.thumb_at is null and v.kind <> 'live' and coalesce(v.score, 0) >= p_min
     and (v.channel_id in (select channel_id from chans)
          or v.id in (select h.video_id from outlier_niche_hits h where h.niche_id in (select id from niches))
          or (p_team is not null and v.id in (select s.video_id from outlier_saves s where s.team_id = p_team and s.video_id is not null)))
   order by v.score desc nulls last
   limit least(greatest(coalesce(p_limit, 60), 1), 500);
$$;
revoke all on function outliers_due_thumbs(uuid, int, real) from public, anon, authenticated;
grant execute on function outliers_due_thumbs(uuid, int, real) to service_role;

-- YouTube's 30 days: every video and channel not refreshed since is deleted
-- (with their views over time and changes), views over time older than
-- `p_stats_days`, old searches and announcements too. Returns what went.
create or replace function outliers_purge(p_stats_days int default 30)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  n_videos int;
  n_channels int;
  n_stats int;
  n_changes int;
begin
  p_stats_days := least(greatest(coalesce(p_stats_days, 30), 1), 1095);
  delete from yt_videos where fetched_at < now() - interval '30 days';
  get diagnostics n_videos = row_count;
  delete from yt_channels where fetched_at < now() - interval '30 days';
  get diagnostics n_channels = row_count;
  delete from yt_video_stats where at < now() - make_interval(days => p_stats_days);
  get diagnostics n_stats = row_count;
  delete from yt_video_changes where at < now() - interval '30 days';
  get diagnostics n_changes = row_count;
  delete from outlier_search_cache where at < now() - interval '3 days';
  delete from outlier_search_log where at < now() - interval '60 days';
  delete from outlier_alerts where at < now() - interval '30 days';
  delete from outlier_quota where day < (now() at time zone 'America/Los_Angeles')::date - 14;
  return jsonb_build_object('videos', n_videos, 'channels', n_channels, 'stats', n_stats, 'changes', n_changes);
end;
$$;
revoke all on function outliers_purge(int) from public, anon, authenticated;
grant execute on function outliers_purge(int) to service_role;

-- The timer: one call per team that follows a niche or tracks a channel, and
-- one for the explore niches.
create or replace function outliers_fanout()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct team_id from (
      select team_id from outlier_niches where team_id is not null
      union
      select team_id from outlier_tracked
    ) t
  loop
    perform posting_call(jsonb_build_object('job', 'outliers', 'team', r.team_id));
    n := n + 1;
  end loop;
  perform posting_call(jsonb_build_object('job', 'outliers', 'explore', true));
  return n + 1;
end;
$$;
revoke all on function outliers_fanout() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'vplanner-outliers') then
    perform cron.unschedule('vplanner-outliers');
  end if;
end $$;
select cron.schedule('vplanner-outliers', '17,47 * * * *', $$ select outliers_fanout(); $$);
