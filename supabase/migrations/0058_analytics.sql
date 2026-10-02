-- ============================================================================
-- 0058: analytics
--
-- Numbers from the platforms, copied once a day by the server (the app's
-- daily job + "Sync now"), so the Analytics page is fast and keeps history
-- the platforms themselves don't.
--   * analytics_daily: per team, platform, day (and content: all / shorts /
--     long): views, watch time, likes, comments, shares, followers… plus
--     running totals where a platform only gives totals (TikTok).
--   * analytics_countries: per day and country (views on YouTube; followers
--     by country on Instagram, as a snapshot).
--   * analytics_content: each video / post with its latest numbers, linked
--     to our short or long video when we can tell which one it is.
--   * analytics_syncs: when each platform was last copied, and any error.
--   * analytics_revenue_daily: YouTube estimated revenue. Only masters and
--     the people a master picks (revenue_access) can read it.
-- Everyone on the team reads the rest. Nobody writes these tables from the
-- browser: only the server (service role) does.
-- Run on staging, then production. Safe to run more than once.
-- ============================================================================

create table if not exists analytics_daily (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  day date not null,
  content text not null default 'all' check (content in ('all', 'shorts', 'long')),
  views bigint,
  watch_minutes numeric(16, 1),
  avg_view_seconds numeric(10, 1),
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  reach bigint,
  followers_gained bigint,
  followers_lost bigint,
  -- Snapshots (totals at the time of the copy), for platforms that only
  -- give totals: the page works out the daily change from these.
  followers bigint,
  total_views bigint,
  total_likes bigint,
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, day, content)
);
create index if not exists analytics_daily_team_day_idx on analytics_daily (team_id, day);

create table if not exists analytics_countries (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  metric text not null check (metric in ('views', 'followers')),
  day date not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  value bigint not null default 0,
  watch_minutes numeric(16, 1),
  primary key (team_id, platform, metric, day, country)
);
create index if not exists analytics_countries_team_day_idx on analytics_countries (team_id, metric, day);

create table if not exists analytics_content (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  external_id text not null check (char_length(external_id) <= 200),
  kind text not null default 'post' check (kind in ('short', 'long', 'post')),
  title text,
  url text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds int,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  reach bigint,
  short_id uuid references short_videos(id) on delete set null,
  project_id uuid references long_video_projects(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, external_id)
);
create index if not exists analytics_content_team_published_idx on analytics_content (team_id, published_at desc);
create index if not exists analytics_content_short_idx on analytics_content (short_id) where short_id is not null;
create index if not exists analytics_content_project_idx on analytics_content (project_id) where project_id is not null;

create table if not exists analytics_syncs (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  -- The first copy goes back further (history); later ones only the last days.
  backfilled boolean not null default false,
  revenue_note text,
  primary key (team_id, platform)
);

create table if not exists analytics_revenue_daily (
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null default 'youtube' check (platform in ('youtube')),
  day date not null,
  content text not null default 'all' check (content in ('all', 'shorts', 'long')),
  revenue numeric(14, 4) not null default 0,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, day, content)
);

-- Who (besides masters) may see revenue. Masters give and take it away.
create table if not exists revenue_access (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists revenue_access_user_idx on revenue_access (user_id);

create or replace function can_view_revenue(p_team uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team and tm.user_id = auth.uid() and tm.status = 'active' and mr.role = 'master'
  ) or exists (
    select 1 from revenue_access ra
    join team_members tm on tm.team_id = ra.team_id and tm.user_id = ra.user_id and tm.status = 'active'
    where ra.team_id = p_team and ra.user_id = auth.uid()
  );
$$;

create or replace function is_master_of(p_team uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team and tm.user_id = auth.uid() and tm.status = 'active' and mr.role = 'master'
  );
$$;

-- ---- read access ----------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['analytics_daily', 'analytics_countries', 'analytics_content', 'analytics_syncs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format('drop policy if exists "team reads %s" on %I', t, t);
    execute format('create policy "team reads %s" on %I for select to authenticated using (team_id in (select my_team_ids()))', t, t);
  end loop;
end $$;

alter table analytics_revenue_daily enable row level security;
revoke all on analytics_revenue_daily from anon, authenticated;
grant select on analytics_revenue_daily to authenticated;
drop policy if exists "revenue for masters and chosen people" on analytics_revenue_daily;
create policy "revenue for masters and chosen people" on analytics_revenue_daily for select to authenticated
  using (can_view_revenue(team_id));

alter table revenue_access enable row level security;
revoke all on revenue_access from anon, authenticated;
grant select, insert, delete on revenue_access to authenticated;
drop policy if exists "masters and the person see access" on revenue_access;
create policy "masters and the person see access" on revenue_access for select to authenticated
  using (user_id = auth.uid() or is_master_of(team_id));
drop policy if exists "masters give access" on revenue_access;
create policy "masters give access" on revenue_access for insert to authenticated
  with check (
    is_master_of(team_id)
    and exists (select 1 from team_members tm where tm.team_id = revenue_access.team_id and tm.user_id = revenue_access.user_id and tm.status = 'active')
  );
drop policy if exists "masters take access away" on revenue_access;
create policy "masters take access away" on revenue_access for delete to authenticated
  using (is_master_of(team_id));

create or replace function revenue_access_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.granted_at := now();
  return new;
end;
$$;
drop trigger if exists revenue_access_before_insert on revenue_access;
create trigger revenue_access_before_insert before insert on revenue_access
  for each row execute procedure revenue_access_before_insert();
