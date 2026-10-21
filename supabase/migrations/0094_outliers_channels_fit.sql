-- ============================================================================
-- 0094: Outliers, accurate (1.29.0)
--
-- A niche is now its keywords AND its own channels, and only channels that
-- really fit count:
--
--   * outlier_niches: langs (the languages its creators speak; null = the
--     team's own language, worked out by the server; '{}' = any), regions
--     (where its creators are from; null / '{}' = anywhere), only_group
--     (only the niche's own channels count, nothing found by keywords),
--     kids (made-for-kids videos count; off by default), profile (server:
--     the words and categories the niche is about).
--   * outlier_niche_channels: verdict ('ok' or why a found channel doesn't
--     count: topic, lang, region, kids) and rel_v (which version of the fit
--     worked it out: older ones wait for the next check). Sources: search,
--     featured, seed (built in), manual and audience (picked by someone:
--     the niche's own channels, always counted).
--   * outlier_niche_hits.ok: a video found by a niche's search counts only
--     when it fits too.
--   * yt_channels: each channel's profile (main language, how much of it is
--     made for kids, its main category, where it's likely from, its words).
--     yt_videos.lang_region: the region in its audio language ("en-IN" → IN).
--   * outlier_blocked: channels a team never wants to see (anyone on the
--     team hides one; anyone brings it back).
--   * outlier_audience: channels the team's viewers also watch (from the
--     team's own YouTube Analytics: the videos YouTube suggested theirs
--     next to), worked out by the server once a day.
--   * outlier_quota: separate budgets for the explore niches (xunits,
--     xsearch), so a team's collecting can't starve them.
--
-- The reading functions follow the new rule everywhere (outlier_scope,
-- outliers_videos, outliers_channels, outliers_corpus, the collector's
-- helpers, alerts); outliers_channels shows channels that aren't read yet
-- (tracked ones were missing until their data arrived).
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table outlier_niches add column if not exists langs text[];
alter table outlier_niches add column if not exists regions text[];
alter table outlier_niches add column if not exists only_group boolean not null default false;
alter table outlier_niches add column if not exists kids boolean not null default false;
alter table outlier_niches add column if not exists profile jsonb;
alter table outlier_niches add column if not exists profile_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outlier_niches_langs_check') then
    alter table outlier_niches add constraint outlier_niches_langs_check
      check (langs is null or (cardinality(langs) <= 8 and array_to_string(langs, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outlier_niches_regions_check') then
    alter table outlier_niches add constraint outlier_niches_regions_check
      check (regions is null or (cardinality(regions) <= 80 and array_to_string(regions, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outlier_niches_profile_size_check') then
    alter table outlier_niches add constraint outlier_niches_profile_size_check check (profile is null or pg_column_size(profile) <= 65536);
  end if;
end $$;

grant insert (langs, regions, only_group, kids) on outlier_niches to authenticated;
grant update (langs, regions, only_group, kids) on outlier_niches to authenticated;

alter table outlier_niche_channels add column if not exists verdict text;
alter table outlier_niche_channels add column if not exists rel_v smallint not null default 0;
alter table outlier_niche_channels add column if not exists added_by uuid references profiles(id) on delete set null;
do $$
declare
  c record;
begin
  -- The source check gets 'audience' (found by its own name, or the 0091 one by what it says).
  for c in
    select conname from pg_constraint
     where conrelid = 'outlier_niche_channels'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%source%' and conname <> 'outlier_niche_channels_source_v2_check'
  loop
    execute format('alter table outlier_niche_channels drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'outlier_niche_channels_source_v2_check') then
    alter table outlier_niche_channels add constraint outlier_niche_channels_source_v2_check
      check (source in ('search', 'seed', 'featured', 'manual', 'audience'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outlier_niche_channels_verdict_check') then
    alter table outlier_niche_channels add constraint outlier_niche_channels_verdict_check
      check (verdict is null or verdict in ('ok', 'topic', 'lang', 'region', 'kids'));
  end if;
end $$;
create index if not exists outlier_niche_channels_niche_idx on outlier_niche_channels (niche_id, source);

alter table outlier_niche_hits add column if not exists ok boolean;

alter table yt_channels add column if not exists main_lang text;
alter table yt_channels add column if not exists lang_share real;
alter table yt_channels add column if not exists kids_share real;
alter table yt_channels add column if not exists top_cat smallint;
alter table yt_channels add column if not exists region_guess text;
alter table yt_channels add column if not exists profile jsonb;
alter table yt_channels add column if not exists profile_v smallint not null default 0;
alter table yt_channels add column if not exists profile_at timestamptz;
alter table yt_channels add column if not exists scan_depth smallint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'yt_channels_profile_size_check') then
    alter table yt_channels add constraint yt_channels_profile_size_check check (profile is null or pg_column_size(profile) <= 16384);
  end if;
end $$;

alter table yt_videos add column if not exists lang_region text;

-- Server only: when the viewers-also-watch list was last worked out.
alter table outlier_settings add column if not exists audience_at timestamptz;
alter table outlier_settings add column if not exists audience_note text;

-- Explore niches get budgets of their own.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'outlier_quota'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%bucket%' and conname <> 'outlier_quota_bucket_v2_check'
  loop
    execute format('alter table outlier_quota drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'outlier_quota_bucket_v2_check') then
    alter table outlier_quota add constraint outlier_quota_bucket_v2_check check (bucket in ('search', 'units', 'stats', 'xunits', 'xsearch'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Channels a team hides
-- ---------------------------------------------------------------------------
create table if not exists outlier_blocked (
  team_id uuid not null references teams(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  -- Its name when it was hidden (the list still reads after YouTube's data goes).
  title text check (title is null or char_length(title) <= 120),
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (team_id, channel_id)
);
create index if not exists outlier_blocked_channel_idx on outlier_blocked (channel_id);

create or replace function outlier_blocked_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n from outlier_blocked where team_id = new.team_id;
  if n >= 1000 then
    raise exception 'A team can hide at most 1,000 channels.' using errcode = 'P0001';
  end if;
  new.added_by := auth.uid();
  new.added_at := now();
  new.title := nullif(btrim(left(coalesce(new.title, ''), 120)), '');
  return new;
end;
$$;
drop trigger if exists outlier_blocked_guard on outlier_blocked;
create trigger outlier_blocked_guard before insert on outlier_blocked
for each row execute function outlier_blocked_guard();

alter table outlier_blocked enable row level security;
revoke all on outlier_blocked from anon, authenticated;
grant select, delete on outlier_blocked to authenticated;
grant insert (team_id, channel_id, title) on outlier_blocked to authenticated;
drop policy if exists "teammates see hidden channels" on outlier_blocked;
create policy "teammates see hidden channels" on outlier_blocked for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "teammates hide channels" on outlier_blocked;
create policy "teammates hide channels" on outlier_blocked for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "teammates bring channels back" on outlier_blocked;
create policy "teammates bring channels back" on outlier_blocked for delete to authenticated
  using (team_id in (select my_team_ids()));

-- ---------------------------------------------------------------------------
-- 3. Channels the team's viewers also watch (server writes, teammates read)
-- ---------------------------------------------------------------------------
create table if not exists outlier_audience (
  team_id uuid not null references teams(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  -- Views YouTube sent to the team's videos from this channel's videos (suggested next to them).
  views bigint not null default 0,
  -- How many of its videos did, and next to how many of the team's videos.
  videos int not null default 0,
  ours int not null default 0,
  -- Its videos that sent the most (up to 3), for the list.
  top text[] not null default '{}' check (cardinality(top) <= 3),
  updated_at timestamptz not null default now(),
  primary key (team_id, channel_id)
);
create index if not exists outlier_audience_team_idx on outlier_audience (team_id, views desc);
alter table outlier_audience enable row level security;
revoke all on outlier_audience from anon, authenticated;
grant select on outlier_audience to authenticated;
drop policy if exists "teammates see who their viewers watch" on outlier_audience;
create policy "teammates see who their viewers watch" on outlier_audience for select to authenticated
  using (team_id in (select my_team_ids()));

-- ---------------------------------------------------------------------------
-- 4. Which channels count: a niche's own channels always; channels found by
--    its keywords only when they fit (and the niche takes found ones); never
--    one the team hid or took out of the niche.
-- ---------------------------------------------------------------------------
-- p_niche null: every niche of the team (a team without niches: the explore
-- niches; p_team null: the explore niches). p_group_only: only the niches' own.
create or replace function outlier_members(p_team uuid, p_niche uuid, p_group_only boolean default false)
returns table (channel_id text, grp boolean)
language sql
stable
security definer set search_path = public
as $$
  select nc.channel_id, bool_or(nc.source in ('manual', 'seed', 'audience')) as grp
    from outlier_niche_channels nc
    join outlier_niches n on n.id = nc.niche_id
   where (case when p_niche is not null then n.id = p_niche
               when p_team is not null then (n.team_id = p_team or (n.team_id is null and not exists (select 1 from outlier_niches t where t.team_id = p_team)))
               else n.team_id is null end)
     and not nc.hidden
     and (nc.source in ('manual', 'seed', 'audience')
          or (not p_group_only and not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok'))
     and (p_team is null or not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = nc.channel_id))
   group by nc.channel_id;
$$;
revoke all on function outlier_members(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function outlier_members(uuid, uuid, boolean) to service_role;

-- The videos a niche's searches found that count (they fit, the niche takes
-- found videos, their channel wasn't hidden or taken out).
create or replace function outlier_member_hits(p_team uuid, p_niche uuid)
returns table (video_id text)
language sql
stable
security definer set search_path = public
as $$
  select distinct h.video_id
    from outlier_niche_hits h
    join outlier_niches n on n.id = h.niche_id
    join yt_videos v on v.id = h.video_id
   where (case when p_niche is not null then n.id = p_niche
               when p_team is not null then (n.team_id = p_team or (n.team_id is null and not exists (select 1 from outlier_niches t where t.team_id = p_team)))
               else n.team_id is null end)
     and h.ok is true
     and not n.only_group
     and not exists (select 1 from outlier_niche_channels nc where nc.niche_id = n.id and nc.channel_id = v.channel_id and nc.hidden)
     and (p_team is null or not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = v.channel_id));
$$;
revoke all on function outlier_member_hits(uuid, uuid) from public, anon, authenticated;
grant execute on function outlier_member_hits(uuid, uuid) to service_role;

-- The channels and videos a scope covers (same signature as 0091): one niche,
-- every niche, tracked channels, the niches' own channels ('group'), the
-- channels the team's viewers watch ('audience'), one channel, or a list of
-- video ids (a live search).
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
    select coalesce(array_agg(t.channel_id), '{}') into chans
      from outlier_tracked t
     where t.team_id = p_team
       and not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = t.channel_id);
    return;
  end if;
  if v_scope = 'audience' then
    select coalesce(array_agg(a.channel_id), '{}') into chans
      from (select a.channel_id from outlier_audience a
             where a.team_id = p_team
               and not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = a.channel_id)
             order by a.views desc limit 300) a;
    return;
  end if;
  select coalesce(array_agg(m.channel_id), '{}') into chans from outlier_members(p_team, p_niche, v_scope = 'group') m;
  if v_scope <> 'group' then
    select coalesce(array_agg(h.video_id), '{}') into hits from outlier_member_hits(p_team, p_niche) h;
  end if;
end;
$$;
revoke all on function outlier_scope(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function outlier_scope(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Reading videos (same signature and columns as 0091): hidden channels
--    never show, made-for-kids videos only in a niche that takes them.
-- ---------------------------------------------------------------------------
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
  v_kids boolean := false;
  v_blocked text[];
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
  -- Made for kids: only a niche that takes them (or one channel looked at on purpose).
  if p_niche is not null then
    select n.kids into v_kids from outlier_niches n where n.id = p_niche;
  end if;
  if not coalesce(v_kids, false) and not (p_f ? 'channel') then
    v_where := v_where || ' and v.kids is not true';
  end if;
  -- Hidden channels: nowhere but their own page.
  if not (p_f ? 'channel') then
    select coalesce(array_agg(b.channel_id), '{}') into v_blocked from outlier_blocked b where b.team_id = p_team;
    if cardinality(v_blocked) > 0 then
      v_where := v_where || ' and not (v.channel_id = any($27))';
    end if;
  else
    v_blocked := '{}';
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
      v_where := v_where || ' and (outlier_doc(v.title, v.tags) @@ $20 or lower(c.title) like $21 or lower(coalesce(c.handle, '''')) like $21)';
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
    p_limit, p_offset,
    v_blocked;
end;
$$;
revoke all on function outliers_videos(uuid, uuid, jsonb, text, int, int) from public, anon;
grant execute on function outliers_videos(uuid, uuid, jsonb, text, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Reading channels: which ones count and why not, channels not read yet
--    (they show as "reading"), the team's hidden ones.
--    p_f->>'only': all (the ones that count, the default) | group (the
--    niche's own) | found (found by keywords and counted) | out (found but
--    not counted, or not checked yet) | hidden (taken out of the niche) |
--    tracked | blocked (hidden by the team). Other filters as in 0091.
-- ---------------------------------------------------------------------------
drop function if exists outliers_channels(uuid, uuid, jsonb, text, int, int);
create function outliers_channels(
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
  verdict text,
  grp boolean,
  counted boolean,
  blocked boolean,
  pending boolean,
  main_lang text,
  region text,
  total bigint
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_only text := coalesce(nullif(p_f->>'only', ''), case when coalesce((p_f->>'hidden')::boolean, false) then 'hidden' when coalesce((p_f->>'tracked')::boolean, false) or p_f->>'scope' = 'tracked' then 'tracked' else 'all' end);
  v_q text := nullif(lower(btrim(p_f->>'q')), '');
  v_like text;
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
  v_like := case when v_q is null then null else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
  with members as (
    select nc.channel_id,
           (array_agg(nc.source order by (nc.source in ('manual', 'seed', 'audience')) desc, nc.added_at))[1] as source,
           bool_or(nc.source in ('manual', 'seed', 'audience')) as grp,
           max(nc.relevance) as relevance,
           bool_and(nc.hidden) as hidden,
           (array_agg(nc.verdict order by (nc.verdict = 'ok') desc nulls last, nc.relevance desc nulls last))[1] as verdict,
           coalesce(bool_or(nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok')) filter (where not nc.hidden), false) as counted
      from outlier_niche_channels nc
      join outlier_niches n on n.id = nc.niche_id
     where v_only not in ('tracked', 'blocked')
       and (case when p_niche is not null then n.id = p_niche
                 else (n.team_id = p_team or (n.team_id is null and not exists (select 1 from outlier_niches t where t.team_id = p_team))) end)
     group by nc.channel_id
    union all
    select t.channel_id, 'tracked', false, null::real, false, null::text, true
      from outlier_tracked t where v_only = 'tracked' and t.team_id = p_team
    union all
    select b.channel_id, 'blocked', false, null::real, false, null::text, false
      from outlier_blocked b where v_only = 'blocked' and b.team_id = p_team
  ),
  picked as (
    select m.* from members m
     where case v_only
             when 'group' then m.grp and not m.hidden
             when 'found' then m.counted and not m.grp
             when 'out' then not m.counted and not m.hidden and not m.grp
             when 'hidden' then m.hidden
             when 'tracked' then true
             when 'blocked' then true
             else m.counted
           end
       and (v_only = 'blocked' or not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = m.channel_id))
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
    select p.channel_id as id,
           coalesce(c.title, (select b.title from outlier_blocked b where b.team_id = p_team and b.channel_id = p.channel_id), '') as title,
           c.handle, c.avatar_url, c.country, c.published_at, c.subscribers, c.views, c.video_count,
           c.long_median, c.short_median, c.uploads_week, c.last_upload_at,
           coalesce(a.stored, 0) as stored, coalesce(a.outliers, 0) as outliers, a.best, a.best_video,
           exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = p.channel_id) as tracked,
           p.source, p.relevance, p.hidden, p.verdict, p.grp, p.counted,
           exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = p.channel_id) as blocked,
           (c.id is null or c.scanned_at is null) as pending,
           c.main_lang, coalesce(c.country, c.region_guess) as region
      from picked p
      left join yt_channels c on c.id = p.channel_id
      left join agg a on a.channel_id = p.channel_id
     where (not (p_f ? 'min_subs') or c.subscribers >= (p_f->>'min_subs')::bigint)
       and (not (p_f ? 'max_subs') or c.subscribers <= (p_f->>'max_subs')::bigint)
       and (not (p_f ? 'min_rate') or coalesce(a.outliers::real / nullif(a.stored, 0), 0) >= (p_f->>'min_rate')::real)
       and (not (p_f ? 'active_days') or c.last_upload_at >= now() - make_interval(days => least(greatest((p_f->>'active_days')::int, 1), 36500)))
       and (not (p_f ? 'channel_days') or c.published_at >= now() - make_interval(days => least(greatest((p_f->>'channel_days')::int, 1), 36500)))
       and (v_like is null or lower(coalesce(c.title, '')) like v_like or lower(coalesce(c.handle, '')) like v_like
            or (c.id is null and lower(coalesce((select b.title from outlier_blocked b where b.team_id = p_team and b.channel_id = p.channel_id), '')) like v_like))
  )
  select r.id, r.title, r.handle, r.avatar_url, r.country, r.published_at, r.subscribers, r.views, r.video_count,
         r.long_median, r.short_median, r.uploads_week, r.last_upload_at, r.stored, r.outliers, r.best, r.best_video,
         r.tracked, r.source, r.relevance, r.hidden, r.verdict, r.grp, r.counted, r.blocked, r.pending, r.main_lang, r.region,
         count(*) over () as total
    from rows r
   order by
     -- Channels still being read go first in lists of picked channels, so it's clear they're on their way.
     case when v_only in ('tracked', 'group') then r.pending end desc nulls last,
     case when p_sort = 'best' then r.best end desc nulls last,
     case when p_sort = 'subs' then r.subscribers end desc nulls last,
     case when p_sort = 'small' then r.subscribers end asc nulls last,
     case when p_sort = 'uploads' then r.uploads_week end desc nulls last,
     case when p_sort = 'recent' then r.last_upload_at end desc nulls last,
     case when p_sort = 'newest' then r.published_at end desc nulls last,
     case when p_sort not in ('best', 'subs', 'small', 'uploads', 'recent', 'newest') then r.outliers::real / nullif(r.stored, 0) end desc nulls last,
     r.best desc nulls last, r.subscribers desc nulls last, r.id
   limit p_limit offset p_offset;
end;
$$;
revoke all on function outliers_channels(uuid, uuid, jsonb, text, int, int) from public, anon;
grant execute on function outliers_channels(uuid, uuid, jsonb, text, int, int) to authenticated, service_role;

-- The channels the team's viewers also watch, with what the page shows.
create or replace function outliers_audience(p_team uuid, p_limit int default 120)
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
    'at', (select s.audience_at from outlier_settings s where s.team_id = p_team),
    'note', (select s.audience_note from outlier_settings s where s.team_id = p_team),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.channel_id, 'views', a.views, 'videos', a.videos, 'ours', a.ours, 'top', a.top,
               'title', c.title, 'handle', c.handle, 'avatar', c.avatar_url, 'subs', c.subscribers,
               'country', coalesce(c.country, c.region_guess), 'lang', c.main_lang,
               'long_median', c.long_median, 'short_median', c.short_median,
               'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = a.channel_id),
               'niches', coalesce((select jsonb_agg(nc.niche_id) from outlier_niche_channels nc join outlier_niches n on n.id = nc.niche_id
                                    where n.team_id = p_team and nc.channel_id = a.channel_id and not nc.hidden and nc.source in ('manual', 'seed', 'audience')), '[]'::jsonb)
             ) order by a.views desc, a.videos desc)
        from (select * from outlier_audience a
               where a.team_id = p_team
                 and not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = a.channel_id)
               order by a.views desc, a.videos desc
               limit least(greatest(coalesce(p_limit, 120), 1), 300)) a
        left join yt_channels c on c.id = a.channel_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function outliers_audience(uuid, int) from public, anon;
grant execute on function outliers_audience(uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. One video, one channel, the page's header (as 0091, plus what's new)
-- ---------------------------------------------------------------------------
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
    'channel', to_jsonb(c) - 'profile',
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
    'blocked', exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = v.channel_id),
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
    'channel', to_jsonb(c) - 'profile',
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'title', x.title, 'views', x.views, 'likes', x.likes, 'comments', x.comments, 'score', x.score, 'projected', x.projected,
               'published_at', x.published_at, 'duration_s', x.duration_s, 'kind', x.kind, 'formats', x.formats, 'vph', x.vph
             ) order by x.published_at desc)
        from (
          (select * from yt_videos where channel_id = c.id and kind = 'long' order by published_at desc limit 100)
          union all
          (select * from yt_videos where channel_id = c.id and kind = 'short' order by published_at desc limit 60)
        ) x
    ), '[]'::jsonb),
    'tracked', exists (select 1 from outlier_tracked t where t.team_id = p_team and t.channel_id = c.id),
    'blocked', exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = c.id),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'folder_id', s.folder_id)) from outlier_saves s where s.team_id = p_team and s.channel_id = c.id), '[]'::jsonb),
    'niches', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'team', n.team_id is not null, 'source', nc.source, 'relevance', nc.relevance, 'hidden', nc.hidden,
                                          'verdict', nc.verdict, 'grp', nc.source in ('manual', 'seed', 'audience'),
                                          'counted', not nc.hidden and (nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok'))))
        from outlier_niche_channels nc join outlier_niches n on n.id = nc.niche_id
       where nc.channel_id = c.id and (n.team_id = p_team or n.team_id is null)
    ), '[]'::jsonb),
    'audience', (select jsonb_build_object('views', a.views, 'videos', a.videos, 'ours', a.ours) from outlier_audience a where a.team_id = p_team and a.channel_id = c.id)
  );
end;
$$;
revoke all on function outliers_channel(uuid, text) from public, anon;
grant execute on function outliers_channel(uuid, text) to authenticated, service_role;

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
               'langs', n.langs, 'regions', n.regions, 'only_group', n.only_group, 'kids', n.kids,
               'crawled_at', n.crawled_at, 'insights_at', n.insights_at, 'created_at', n.created_at,
               'counts', n.crawl->'counts', 'note', n.crawl->>'note', 'phase', n.crawl->>'phase', 'team_lang', n.crawl->>'team_lang', 'fit_v', n.crawl->>'fit_v',
               'group_n', (select count(*) from outlier_niche_channels nc where nc.niche_id = n.id and not nc.hidden and nc.source in ('manual', 'seed', 'audience')),
               'found_n', (select count(*) from outlier_niche_channels nc where nc.niche_id = n.id and not nc.hidden and nc.source not in ('manual', 'seed', 'audience') and nc.rel_v >= 2 and nc.verdict = 'ok'),
               'out_n', (select count(*) from outlier_niche_channels nc where nc.niche_id = n.id and not nc.hidden and nc.source not in ('manual', 'seed', 'audience') and not (nc.rel_v >= 2 and nc.verdict is not distinct from 'ok'))
             ) order by n.position, n.created_at)
        from outlier_niches n where n.team_id = p_team
    ), '[]'::jsonb),
    'explore', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'slug', n.slug, 'name', n.name, 'color', n.color, 'keywords', n.keywords, 'counts', n.crawl->'counts', 'crawled_at', n.crawled_at,
                                          'phase', n.crawl->>'phase', 'group_n', (select count(*) from outlier_niche_channels nc where nc.niche_id = n.id and not nc.hidden and nc.source in ('manual', 'seed', 'audience'))) order by n.name)
        from outlier_niches n where n.team_id is null
    ), '[]'::jsonb),
    'tracked', coalesce((select jsonb_agg(t.channel_id order by t.added_at desc) from outlier_tracked t where t.team_id = p_team), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.channel_id, 'title', coalesce(c.title, b.title), 'avatar', c.avatar_url, 'at', b.added_at) order by b.added_at desc)
                           from outlier_blocked b left join yt_channels c on c.id = b.channel_id where b.team_id = p_team), '[]'::jsonb),
    'audience_n', (select count(*) from outlier_audience a where a.team_id = p_team),
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'color', f.color, 'position', f.position, 'created_by', f.created_by,
               'count', (select count(*) from outlier_saves s where s.folder_id = f.id)) order by f.position, f.created_at)
        from outlier_folders f where f.team_id = p_team
    ), '[]'::jsonb),
    'saved', (select count(*) from outlier_saves s where s.team_id = p_team),
    'unsorted', (select count(*) from outlier_saves s where s.team_id = p_team and s.folder_id is null),
    'saves', coalesce((
      select jsonb_agg(jsonb_build_array(x.ref, x.folder_id, x.id))
        from (select coalesce(s.video_id, s.channel_id) as ref, s.folder_id, s.id
                from outlier_saves s
               where s.team_id = p_team and s.kind in ('video', 'channel')
               order by s.saved_at desc limit 3000) x
    ), '[]'::jsonb),
    'settings', (select to_jsonb(st) - 'team_id' - 'digest_sent_on' - 'audience_note' from outlier_settings st where st.team_id = p_team)
  );
end;
$$;
revoke all on function outliers_overview(uuid) from public, anon;
grant execute on function outliers_overview(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. The collector's side (service role only)
-- ---------------------------------------------------------------------------
-- A niche's videos for its insights (same shape as 0091), only what counts.
create or replace function outliers_corpus(p_niche uuid, p_limit int default 30000)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with niches as (
    select n.id, n.team_id, n.kids from outlier_niches n
     where (p_niche is not null and n.id = p_niche) or (p_niche is null and n.team_id is null)
  ),
  team as (select (select team_id from niches limit 1) as id),
  chans as (
    select m.channel_id from outlier_members((select id from team), p_niche, false) m
  ),
  hits as (
    select h.video_id from outlier_member_hits((select id from team), p_niche) h
  ),
  picked as (
    select v.id, v.channel_id, v.title, v.kind, v.published_at, v.views, v.score, v.duration_s, v.lang,
           v.formats, v.bits, v.thumb_colors, v.thumb_lum, v.thumb_sat, c.subscribers
      from yt_videos v join yt_channels c on c.id = v.channel_id
     where (v.channel_id in (select channel_id from chans) or v.id in (select video_id from hits))
       and v.kind <> 'live'
       and (v.kids is not true or coalesce((select bool_and(kids) from niches), false))
     order by v.published_at desc
     limit least(greatest(coalesce(p_limit, 30000), 1), 100000)
  )
  select coalesce(jsonb_agg(jsonb_build_array(id, channel_id, title, kind, published_at, views, score, duration_s, lang, formats, bits, thumb_colors, thumb_lum, thumb_sat, subscribers)), '[]'::jsonb)
    from picked;
$$;
revoke all on function outliers_corpus(uuid, int) from public, anon, authenticated;
grant execute on function outliers_corpus(uuid, int) to service_role;

-- Channels whose uploads are due, most urgent first: tracked every 6 hours;
-- a niche's own channels and found ones never read (to know if they fit);
-- then the niche's own daily (every 3 days when quiet; explore seeds every
-- 2 days), found ones that fit daily (explore: 10 days), found ones that
-- don't fit monthly (they might change).
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
           case when c.scanned_at is null then (case when nc.source in ('manual', 'seed', 'audience') then 1 else 2 end) else 3 end,
           case when nc.source in ('manual', 'seed', 'audience') then 'group' else 'niche' end,
           case
             when nc.source in ('manual', 'seed', 'audience') then
               case when n.team_id is null then interval '2 days'
                    when c.last_upload_at is null or c.last_upload_at < now() - interval '30 days' then interval '3 days'
                    else interval '1 day' end
             when nc.rel_v >= 2 and nc.verdict is distinct from 'ok' then interval '30 days'
             when n.only_group then interval '30 days'
             when n.team_id is null then interval '10 days'
             when c.last_upload_at is null or c.last_upload_at < now() - interval '30 days' then interval '3 days'
             else interval '1 day'
           end
      from outlier_niche_channels nc
      join outlier_niches n on n.id = nc.niche_id
      left join yt_channels c on c.id = nc.channel_id
     where not nc.hidden
       and ((p_team is not null and n.team_id = p_team) or (p_team is null and n.team_id is null))
       and (p_team is null or not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = nc.channel_id))
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

-- Every channel a team keeps (counted in one of its niches, or tracked); p_team
-- null: the explore niches'.
create or replace function outlier_kept_channels(p_team uuid)
returns table (channel_id text)
language sql
stable
security definer set search_path = public
as $$
  select nc.channel_id
    from outlier_niche_channels nc
    join outlier_niches n on n.id = nc.niche_id
   where ((p_team is not null and n.team_id = p_team) or (p_team is null and n.team_id is null))
     and not nc.hidden
     and (nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok'))
     and (p_team is null or not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = nc.channel_id))
  union
  select t.channel_id from outlier_tracked t where p_team is not null and t.team_id = p_team;
$$;
revoke all on function outlier_kept_channels(uuid) from public, anon, authenticated;
grant execute on function outlier_kept_channels(uuid) to service_role;

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
    select k.channel_id from outlier_kept_channels(p_team) k
  ),
  saved as (
    select s.video_id from outlier_saves s where p_team is not null and s.team_id = p_team and s.video_id is not null
  ),
  pool as (
    select v.id, v.published_at, v.stats_at, v.fetched_at, (v.id in (select video_id from saved)) as kept
      from yt_videos v
     where v.channel_id in (select channel_id from chans) or v.id in (select video_id from saved)
        or v.id in (select h.video_id from outlier_niche_hits h where h.niche_id in (select id from niches) and h.ok is true)
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
    select k.channel_id from outlier_kept_channels(p_team) k
  )
  select v.id, v.kind from yt_videos v
   where v.thumb_at is null and v.kind <> 'live' and coalesce(v.score, 0) >= p_min
     and (v.channel_id in (select channel_id from chans)
          or v.id in (select h.video_id from outlier_niche_hits h where h.niche_id in (select id from niches) and h.ok is true)
          or (p_team is not null and v.id in (select s.video_id from outlier_saves s where s.team_id = p_team and s.video_id is not null)))
   order by v.score desc nulls last
   limit least(greatest(coalesce(p_limit, 60), 1), 500);
$$;
revoke all on function outliers_due_thumbs(uuid, int, real) from public, anon, authenticated;
grant execute on function outliers_due_thumbs(uuid, int, real) to service_role;

-- Alerts: tracked channels' new outliers, and watched words in the channels
-- that count in the team's niches; never a hidden channel.
create or replace function outliers_alert_candidates(p_team uuid, p_min real, p_words text[])
returns table (video_id text, channel_id text, title text, score real, projected real, views bigint, why text, word text)
language sql
stable
security definer set search_path = public
as $$
  with niche_chans as (
    select nc.channel_id
      from outlier_niche_channels nc
      join outlier_niches n on n.id = nc.niche_id
     where n.team_id = p_team
       and not nc.hidden
       and (nc.source in ('manual', 'seed', 'audience') or (not n.only_group and nc.rel_v >= 2 and nc.verdict = 'ok'))
  ),
  fresh as (
    select v.* from yt_videos v
     where v.published_at > now() - interval '3 days'
       and v.kind <> 'live'
       and v.kids is not true
       and greatest(coalesce(v.score, 0), coalesce(v.projected, 0)) >= p_min
       and not exists (select 1 from outlier_alerts a where a.team_id = p_team and a.video_id = v.id)
       and not exists (select 1 from outlier_blocked b where b.team_id = p_team and b.channel_id = v.channel_id)
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

-- What a channel's profile is worked out from: its latest p_per videos
-- (not live), as {channel: [[title, tags, category, lang, lang_region, kids, kind, published_at], …]}.
create or replace function outliers_channel_samples(p_channels text[], p_per int default 40)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(c.id, coalesce(s.list, '[]'::jsonb)), '{}'::jsonb)
    from unnest(coalesce(p_channels, '{}')) as c(id)
    left join lateral (
      select jsonb_agg(jsonb_build_array(v.title, v.tags, v.category, v.lang, v.lang_region, v.kids, v.kind, v.published_at) order by v.published_at desc) as list
        from (select * from yt_videos v
               where v.channel_id = c.id and v.kind <> 'live'
               order by v.published_at desc
               limit least(greatest(coalesce(p_per, 40), 1), 120)) v
    ) s on true
   where c.id ~ '^UC[A-Za-z0-9_-]{22}$';
$$;
revoke all on function outliers_channel_samples(text[], int) from public, anon, authenticated;
grant execute on function outliers_channel_samples(text[], int) to service_role;

-- Channels' profiles: [{id, main_lang, lang_share, kids_share, top_cat, region_guess, profile, v}].
create or replace function outliers_set_profiles(p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(id text, main_lang text, lang_share real, kids_share real, top_cat smallint, region_guess text, profile jsonb, v smallint)
  ), u as (
    update yt_channels c set main_lang = x.main_lang, lang_share = x.lang_share, kids_share = x.kids_share, top_cat = x.top_cat,
                             region_guess = x.region_guess, profile = x.profile, profile_v = coalesce(x.v, c.profile_v), profile_at = now()
      from x where c.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_profiles(jsonb) from public, anon, authenticated;
grant execute on function outliers_set_profiles(jsonb) to service_role;

-- How each channel fits a niche (same signature as 0091): [{channel_id, relevance, verdict, v}].
create or replace function outliers_set_relevance(p_niche uuid, p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(channel_id text, relevance real, verdict text, v smallint)
  ), u as (
    update outlier_niche_channels nc
       set relevance = x.relevance,
           verdict = case when x.verdict in ('ok', 'topic', 'lang', 'region', 'kids') then x.verdict else nc.verdict end,
           rel_v = coalesce(x.v, nc.rel_v)
      from x where nc.niche_id = p_niche and nc.channel_id = x.channel_id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_relevance(uuid, jsonb) from public, anon, authenticated;
grant execute on function outliers_set_relevance(uuid, jsonb) to service_role;

-- Whether each video a niche's searches found fits: [{video_id, ok}].
create or replace function outliers_set_hits(p_niche uuid, p jsonb)
returns int
language sql
security definer set search_path = public
as $$
  with x as (
    select * from jsonb_to_recordset(coalesce(p, '[]'::jsonb)) as r(video_id text, ok boolean)
  ), u as (
    update outlier_niche_hits h set ok = x.ok
      from x where h.niche_id = p_niche and h.video_id = x.video_id
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function outliers_set_hits(uuid, jsonb) from public, anon, authenticated;
grant execute on function outliers_set_hits(uuid, jsonb) to service_role;
