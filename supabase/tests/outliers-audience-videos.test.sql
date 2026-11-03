-- Checks for 0122 (Outliers → Audience shows each channel's videos, Shorts too): outliers_audience() answers, for each
-- channel the team's viewers watch, up to 6 long videos and 6 Shorts: the ones that sent viewers first, then the
-- biggest outliers; only from the last two years (unless they sent viewers); titles cut to 80 characters; long videos
-- before Shorts. Only the team's own people get it. Run by scripts/db/test-from-scratch.sh; each check raises on
-- failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000122', 'av122@example.com'),
  ('00000000-0000-4000-8000-000000000123', 'ao122@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000122', 'av122@example.com'),
  ('00000000-0000-4000-8000-000000000123', 'ao122@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000122a', 'Audience videos A', 'audience-videos-a', '00000000-0000-4000-8000-000000000122'),
  ('10000000-0000-4000-8000-00000000122b', 'Audience videos B', 'audience-videos-b', '00000000-0000-4000-8000-000000000123')
on conflict do nothing;

insert into yt_channels (id, title) values ('UCaudvidsaudvidsaudvids1', 'Their channel') on conflict do nothing;
-- 8 long videos (one old, one old that sent viewers, one with a very long title) and 8 Shorts.
insert into yt_videos (id, channel_id, title, published_at, kind, views, score)
select 'avlong' || lpad(i::text, 5, '0'), 'UCaudvidsaudvidsaudvids1',
       case when i = 3 then repeat('A very long title ', 10) else 'Long ' || i end,
       case when i in (7, 8) then now() - interval '3 years' else now() - (i || ' days')::interval end,
       'long', 1000 * i, i::numeric
  from generate_series(1, 8) i
on conflict do nothing;
insert into yt_videos (id, channel_id, title, published_at, kind, views, score)
select 'avshort' || lpad(i::text, 4, '0'), 'UCaudvidsaudvidsaudvids1', 'Short ' || i, now() - (i || ' days')::interval, 'short', 500 * i, (10 - i)::numeric
  from generate_series(1, 8) i
on conflict do nothing;
-- The daily read: the channel sent team A's viewers through long 2, long 8 (three years old) and Short 6.
insert into outlier_audience (team_id, channel_id, views, videos, ours, top) values
  ('10000000-0000-4000-8000-00000000122a', 'UCaudvidsaudvidsaudvids1', 80, 3, 2, array['avlong00002', 'avlong00008', 'avshort0006'])
on conflict (team_id, channel_id) do update set top = excluded.top, views = excluded.views;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000122');
  set local role authenticated;
  do $$
  declare
    r jsonb := (outliers_audience('10000000-0000-4000-8000-00000000122a')->'rows')->0;
    ex jsonb := r->'examples';
    longs jsonb := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(ex) x where x->>'kind' = 'long');
    shorts jsonb := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(ex) x where x->>'kind' = 'short');
  begin
    if r is null or ex is null then raise exception 'FAIL: no examples for the channel: %', r; end if;
    if jsonb_array_length(longs) <> 6 or jsonb_array_length(shorts) <> 6 then raise exception 'FAIL: expected 6 long videos and 6 Shorts, got % and %', jsonb_array_length(longs), jsonb_array_length(shorts); end if;
    if ex->0->>'kind' <> 'long' or ex->6->>'kind' <> 'short' then raise exception 'FAIL: long videos first, then Shorts: %', ex; end if;
    -- The ones that sent viewers first (by score among them: long 8 then long 2), then the biggest outliers.
    if longs->0->>'id' <> 'avlong00008' or longs->1->>'id' <> 'avlong00002' then raise exception 'FAIL: the videos that sent viewers come first: %', longs; end if;
    if (longs->0->>'sent')::boolean is not true or (longs->2->>'sent')::boolean is not false then raise exception 'FAIL: sent says which sent viewers: %', longs; end if;
    if longs->2->>'id' <> 'avlong00006' then raise exception 'FAIL: then the biggest outlier (long 6): %', longs; end if;
    if exists (select 1 from jsonb_array_elements(longs) x where x->>'id' = 'avlong00007') then raise exception 'FAIL: a three-year-old video that sent nobody came in'; end if;
    if shorts->0->>'id' <> 'avshort0006' or shorts->1->>'id' <> 'avshort0001' then raise exception 'FAIL: Shorts: the one that sent viewers, then the biggest outlier: %', shorts; end if;
    if (select max(char_length(x->>'title')) from jsonb_array_elements(ex) x) > 80 then raise exception 'FAIL: a title longer than 80 characters'; end if;
    if not exists (select 1 from jsonb_array_elements(longs) x where x->>'id' = 'avlong00003' and char_length(x->>'title') = 80) then raise exception 'FAIL: the long title should be cut to 80 characters'; end if;
    if longs->0->'views' is null or longs->0->'score' is null or longs->0->'at' is null then raise exception 'FAIL: each example has its views, score and day: %', longs->0; end if;
  end $$;
rollback;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000123');
  set local role authenticated;
  do $$
  begin
    if outliers_audience('10000000-0000-4000-8000-00000000122a') is not null then raise exception 'FAIL: another team read team A''s audience'; end if;
  end $$;
rollback;
