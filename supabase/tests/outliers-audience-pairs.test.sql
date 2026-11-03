-- Checks for 0106 ("Your viewers watch it" says which videos): outliers_channel()
-- lists the pairs kept for a channel the team's viewers watch, most views first,
-- with the team's video's title and thumbnail (from its analytics) and the
-- channel's video's title; only for the team's own people; the pairs are at most
-- 12 and always a list; nobody but the server writes them. Run by
-- scripts/db/test-from-scratch.sh on the database the migrations just built;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team A, O = master of team B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000c71', 'apm@example.com'),
  ('00000000-0000-4000-8000-000000000c72', 'apo@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000c71', 'apm@example.com'),
  ('00000000-0000-4000-8000-000000000c72', 'apo@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000000c7a', 'Audience pairs A', 'audience-pairs-a', '00000000-0000-4000-8000-000000000c71'),
  ('10000000-0000-4000-8000-000000000c7b', 'Audience pairs B', 'audience-pairs-b', '00000000-0000-4000-8000-000000000c72')
on conflict do nothing;

-- Their channel and two of its videos; two of team A's own videos in its analytics.
insert into yt_channels (id, title) values ('UCappairsappairsappairs1', 'Their channel') on conflict do nothing;
insert into yt_videos (id, channel_id, title, published_at, kind, views, score) values
  ('appairth001', 'UCappairsappairsappairs1', 'Their video one', now() - interval '20 days', 'long', 500000, 2),
  ('appairth002', 'UCappairsappairsappairs1', 'Their video two', now() - interval '10 days', 'long', 300000, 1)
on conflict do nothing;
insert into analytics_content (team_id, platform, external_id, kind, title, thumbnail_url, views) values
  ('10000000-0000-4000-8000-000000000c7a', 'youtube', 'appairour01', 'long', 'My phone video', 'https://i.ytimg.com/vi/appairour01/mqdefault.jpg', 1200),
  ('10000000-0000-4000-8000-000000000c7a', 'youtube', 'appairour02', 'long', 'My other video', null, 800)
on conflict do nothing;
-- The daily read's result for team A (the third pair names a video of ours the analytics don't have).
insert into outlier_audience (team_id, channel_id, views, videos, ours, top, pairs) values
  ('10000000-0000-4000-8000-000000000c7a', 'UCappairsappairsappairs1', 45, 2, 3, array['appairth001', 'appairth002'],
   '[{"ours": "appairour02", "from": "appairth001", "views": 7},
     {"ours": "appairour01", "from": "appairth001", "views": 30},
     {"ours": "appairour09", "from": "appairth002", "views": 5}]'::jsonb)
on conflict (team_id, channel_id) do update set pairs = excluded.pairs, views = excluded.views, ours = excluded.ours;

-- At most 12 pairs, always a list (as the server writes them).
do $$
declare
  many jsonb := (select jsonb_agg(jsonb_build_object('ours', 'appairour01', 'from', 'appairth001', 'views', i)) from generate_series(1, 13) i);
begin
  begin
    update outlier_audience set pairs = many where team_id = '10000000-0000-4000-8000-000000000c7a';
    raise exception 'FAIL: 13 pairs were accepted';
  exception when check_violation then null;
  end;
  begin
    update outlier_audience set pairs = '{"ours": "x"}'::jsonb where team_id = '10000000-0000-4000-8000-000000000c7a';
    raise exception 'FAIL: pairs that aren''t a list were accepted';
  exception when check_violation then null;
  end;
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000c71');
  set local role authenticated;
  do $$
  declare
    a jsonb := outliers_channel('10000000-0000-4000-8000-000000000c7a', 'UCappairsappairsappairs1')->'audience';
    p jsonb := a->'pairs';
  begin
    if a is null then raise exception 'FAIL: the team''s own master gets no audience'; end if;
    if (a->>'views')::int <> 45 or (a->>'ours')::int <> 3 then raise exception 'FAIL: the counts changed: %', a; end if;
    if jsonb_array_length(p) <> 3 then raise exception 'FAIL: expected 3 pairs, got %', p; end if;
    if p->0->>'ours' <> 'appairour01' or (p->0->>'views')::int <> 30 then raise exception 'FAIL: most views first: %', p; end if;
    if p->0->>'ours_title' <> 'My phone video' or p->0->>'from_title' <> 'Their video one' then raise exception 'FAIL: both titles: %', p->0; end if;
    if p->0->>'ours_thumb' is distinct from 'https://i.ytimg.com/vi/appairour01/mqdefault.jpg' then raise exception 'FAIL: our thumbnail: %', p->0; end if;
    if p->1->>'ours_title' <> 'My other video' or p->1->'ours_thumb' <> 'null'::jsonb then raise exception 'FAIL: a video without a thumbnail: %', p->1; end if;
    if p->2->>'ours' <> 'appairour09' or p->2->'ours_title' <> 'null'::jsonb or p->2->>'from_title' <> 'Their video two' then raise exception 'FAIL: a video the analytics don''t have still shows: %', p->2; end if;
  end $$;
  -- Only the server writes them.
  do $$
  begin
    begin
      update outlier_audience set pairs = '[]'::jsonb where team_id = '10000000-0000-4000-8000-000000000c7a';
      raise exception 'FAIL: a teammate changed the pairs';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000c72');
  set local role authenticated;
  do $$
  begin
    if outliers_channel('10000000-0000-4000-8000-000000000c7a', 'UCappairsappairsappairs1') is not null then
      raise exception 'FAIL: another team''s master read team A''s channel panel';
    end if;
    if outliers_channel('10000000-0000-4000-8000-000000000c7b', 'UCappairsappairsappairs1')->'audience' <> 'null'::jsonb then
      raise exception 'FAIL: team B sees team A''s audience';
    end if;
    if exists (select 1 from outlier_audience where team_id = '10000000-0000-4000-8000-000000000c7a') then
      raise exception 'FAIL: another team reads team A''s audience rows';
    end if;
  end $$;
rollback;

-- A team without pairs yet (before the next daily read): an empty list, never null.
update outlier_audience set pairs = '[]'::jsonb where team_id = '10000000-0000-4000-8000-000000000c7a';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000c71');
  set local role authenticated;
  do $$
  begin
    if outliers_channel('10000000-0000-4000-8000-000000000c7a', 'UCappairsappairsappairs1')->'audience'->'pairs' <> '[]'::jsonb then
      raise exception 'FAIL: no pairs should read as an empty list';
    end if;
  end $$;
rollback;
