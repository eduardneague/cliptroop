-- Checks for 0102 (a video's niches, for "Remove from <niche>" at the top of
-- its panel): exactly the niches the video shows in. Its channel counts there
-- (one of the niche's own, or found and a fit), or the niche's searches found
-- the video and it fits; never a niche its channel was taken out of, never a
-- niche that only takes its own channels for a found one, never another
-- team's. Run by scripts/db/test-from-scratch.sh on the database the
-- migrations just built; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team A, O = master of team B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000ea1', 'vm@example.com'),
  ('00000000-0000-4000-8000-000000000eb1', 'vo@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000ea1', 'vm@example.com'),
  ('00000000-0000-4000-8000-000000000eb1', 'vo@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000000eaa', 'Video niches A', 'video-niches-a', '00000000-0000-4000-8000-000000000ea1'),
  ('10000000-0000-4000-8000-000000000ebb', 'Video niches B', 'video-niches-b', '00000000-0000-4000-8000-000000000eb1')
on conflict do nothing;

-- Channels: G (one of the niche's own), F (found, a fit), L (found, another language),
-- H (not on the list, the niche's search found its video and it fits),
-- N (not on the list, found but its video doesn't fit), X (its own, then taken out).
insert into yt_channels (id, title) values
  ('UCvnigroupvnigroupvnigr1', 'Own channel'),
  ('UCvnifoundvnifoundvnifo1', 'Found channel'),
  ('UCvnilangsvnilangsvnila1', 'Other language channel'),
  ('UCvnihitokvnihitokvnihi1', 'Found video channel'),
  ('UCvninofitvninofitvnino1', 'Unfit video channel'),
  ('UCvnitakenvnitakenvnita1', 'Taken out channel')
on conflict do nothing;
insert into yt_videos (id, channel_id, title, published_at, kind, views, score) values
  ('vnivideo0g1', 'UCvnigroupvnigroupvnigr1', 'Own video', now() - interval '3 days', 'long', 900000, 9),
  ('vnivideo0f1', 'UCvnifoundvnifoundvnifo1', 'Found video', now() - interval '3 days', 'long', 900000, 9),
  ('vnivideo0l1', 'UCvnilangsvnilangsvnila1', 'Other language video', now() - interval '3 days', 'long', 900000, 9),
  ('vnivideo0h1', 'UCvnihitokvnihitokvnihi1', 'A video the search found', now() - interval '3 days', 'long', 900000, 9),
  ('vnivideo0n1', 'UCvninofitvninofitvnino1', 'A video that does not fit', now() - interval '3 days', 'long', 900000, 9),
  ('vnivideo0x1', 'UCvnitakenvnitakenvnita1', 'Taken out video', now() - interval '3 days', 'long', 900000, 9)
on conflict do nothing;
-- P: team A's niche; Q: team A's niche of only its own channels; R: team B's niche.
insert into outlier_niches (id, team_id, name, keywords, only_group) values
  ('30000000-0000-4000-8000-000000000ea1', '10000000-0000-4000-8000-000000000eaa', 'Phones', array['phone review'], false),
  ('30000000-0000-4000-8000-000000000ea2', '10000000-0000-4000-8000-000000000eaa', 'Own only', array['phone'], true),
  ('30000000-0000-4000-8000-000000000eb1', '10000000-0000-4000-8000-000000000ebb', 'Their phones', array['phone'], false)
on conflict do nothing;
insert into outlier_niche_channels (niche_id, team_id, channel_id, source, relevance, verdict, rel_v, hidden) values
  ('30000000-0000-4000-8000-000000000ea1', '10000000-0000-4000-8000-000000000eaa', 'UCvnigroupvnigroupvnigr1', 'manual', null, null, 0, false),
  ('30000000-0000-4000-8000-000000000ea1', '10000000-0000-4000-8000-000000000eaa', 'UCvnifoundvnifoundvnifo1', 'search', 0.9, 'ok', 2, false),
  ('30000000-0000-4000-8000-000000000ea1', '10000000-0000-4000-8000-000000000eaa', 'UCvnilangsvnilangsvnila1', 'search', 0.5, 'lang', 2, false),
  ('30000000-0000-4000-8000-000000000ea1', '10000000-0000-4000-8000-000000000eaa', 'UCvnitakenvnitakenvnita1', 'manual', null, null, 0, true),
  ('30000000-0000-4000-8000-000000000ea2', '10000000-0000-4000-8000-000000000eaa', 'UCvnigroupvnigroupvnigr1', 'manual', null, null, 0, false),
  ('30000000-0000-4000-8000-000000000ea2', '10000000-0000-4000-8000-000000000eaa', 'UCvnifoundvnifoundvnifo1', 'search', 0.9, 'ok', 2, false),
  ('30000000-0000-4000-8000-000000000eb1', '10000000-0000-4000-8000-000000000ebb', 'UCvnigroupvnigroupvnigr1', 'manual', null, null, 0, false)
on conflict do nothing;
insert into outlier_niche_hits (niche_id, video_id, ok) values
  ('30000000-0000-4000-8000-000000000ea1', 'vnivideo0h1', true),
  ('30000000-0000-4000-8000-000000000ea1', 'vnivideo0n1', false),
  ('30000000-0000-4000-8000-000000000ea1', 'vnivideo0x1', true),
  ('30000000-0000-4000-8000-000000000ea2', 'vnivideo0h1', true)
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
create or replace function pg_temp.niches(p_team uuid, p_video text) returns text[] language sql as $$
  select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(outliers_video(p_team, p_video)->'niches') x;
$$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000ea1');
  set local role authenticated;
  do $$
  declare
    p text := '30000000-0000-4000-8000-000000000ea1';
    q text := '30000000-0000-4000-8000-000000000ea2';
    a uuid := '10000000-0000-4000-8000-000000000eaa';
  begin
    -- 1. Its channel counts: one of the niche's own (in both niches), or found and a fit (not where only its own count).
    if pg_temp.niches(a, 'vnivideo0g1') <> array[p, q] then raise exception 'FAIL 1: an own channel''s video is in %', pg_temp.niches(a, 'vnivideo0g1'); end if;
    if pg_temp.niches(a, 'vnivideo0f1') <> array[p] then raise exception 'FAIL 1: a found channel''s video is in %', pg_temp.niches(a, 'vnivideo0f1'); end if;
    -- 2. Found but not a fit, and nothing the search found: nowhere.
    if pg_temp.niches(a, 'vnivideo0l1') <> '{}'::text[] then raise exception 'FAIL 2: another language''s video is in %', pg_temp.niches(a, 'vnivideo0l1'); end if;
    -- 3. Not on the list, but the niche's search found the video and it fits: there (not in the niche of only its own).
    if pg_temp.niches(a, 'vnivideo0h1') <> array[p] then raise exception 'FAIL 3: a found video is in %', pg_temp.niches(a, 'vnivideo0h1'); end if;
    -- 4. Found by the search but it doesn't fit: nowhere.
    if pg_temp.niches(a, 'vnivideo0n1') <> '{}'::text[] then raise exception 'FAIL 4: a video that doesn''t fit is in %', pg_temp.niches(a, 'vnivideo0n1'); end if;
    -- 5. Its channel was taken out: not there, even though the search found the video.
    if pg_temp.niches(a, 'vnivideo0x1') <> '{}'::text[] then raise exception 'FAIL 5: a taken out channel''s video is in %', pg_temp.niches(a, 'vnivideo0x1'); end if;
  end $$;
commit;

-- 6. Another team's niches never show, and another team can't read team A's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000eb1');
  set local role authenticated;
  do $$ begin
    if pg_temp.niches('10000000-0000-4000-8000-000000000ebb', 'vnivideo0g1') <> array['30000000-0000-4000-8000-000000000eb1'] then
      raise exception 'FAIL 6: team B sees %', pg_temp.niches('10000000-0000-4000-8000-000000000ebb', 'vnivideo0g1');
    end if;
    if outliers_video('10000000-0000-4000-8000-000000000eaa', 'vnivideo0g1') is not null then raise exception 'FAIL 6: team B read team A''s video panel'; end if;
  end $$;
commit;

select 'outliers-video-niches checks passed' as ok;
