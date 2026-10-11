-- Checks for 0081 (Advanced analytics, frames for the Claude export): who
-- reads the breakdowns, retention curves and each video's money, that only
-- the server writes them, the shape checks, and the video frames (storage
-- and set_version_frames). Run by scripts/db/test-from-scratch.sh on the
-- database the migrations just built; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team G, E = editor in G (the short's editor),
-- V = researcher in G, R = researcher in G who may see revenue,
-- O = master of team H.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'mg@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'eg@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'vg@example.com'),
  ('00000000-0000-4000-8000-0000000000a4', 'rg@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'oh@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'mg@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'eg@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'vg@example.com'),
  ('00000000-0000-4000-8000-0000000000a4', 'rg@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'oh@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000000a', 'Team G', 'team-g', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-00000000000b', 'Team H', 'team-h', '00000000-0000-4000-8000-0000000000b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'eg@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a3', 'vg@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a4', 'rg@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000000a2', 'editor'),
  ('20000000-0000-4000-8000-0000000000a3', 'researcher'),
  ('20000000-0000-4000-8000-0000000000a4', 'researcher')
on conflict do nothing;
insert into revenue_access (team_id, user_id) values ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a4') on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- What the daily copy saved (the server writes these).
insert into analytics_breakdowns (team_id, platform, external_id, dimension, key, day, span, views, watch_minutes, value) values
  ('10000000-0000-4000-8000-00000000000a', 'youtube', '', 'traffic_source', 'YT_SEARCH', current_date - 1, 1, 1200, 340, null),
  ('10000000-0000-4000-8000-00000000000a', 'youtube', '', 'age_gender', 'age25-34|female', current_date - 1, 28, null, null, 12.5),
  ('10000000-0000-4000-8000-00000000000a', 'youtube', 'vid1', 'search_term', 'street food', current_date - 1, 0, 90, 20, null),
  ('10000000-0000-4000-8000-00000000000b', 'youtube', '', 'traffic_source', 'SHORTS', current_date - 1, 1, 500, 80, null);
insert into analytics_retention (team_id, platform, external_id, points) values
  ('10000000-0000-4000-8000-00000000000a', 'youtube', 'vid1', '[[0, 1, 0.6], [0.5, 0.52, 0.55], [1, 0.31, 0.5]]'),
  ('10000000-0000-4000-8000-00000000000b', 'youtube', 'vid9', '[[0, 1, null], [1, 0.2, null]]');
insert into analytics_content_revenue (team_id, platform, external_id, revenue, cpm, ad_impressions) values
  ('10000000-0000-4000-8000-00000000000a', 'youtube', 'vid1', 12.4, 4.1, 3000),
  ('10000000-0000-4000-8000-00000000000b', 'youtube', 'vid9', 99, 9, 10);
insert into analytics_content (team_id, platform, external_id, views, metrics) values
  ('10000000-0000-4000-8000-00000000000a', 'youtube', 'vid1', 5000, '{"red_views": 40, "card_clicks": 3}');

-- 1. Teammates read their team's breakdowns and curves; never another team's; nobody writes.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_breakdowns) <> 3 then raise exception 'FAIL 1: a teammate should see 3 breakdown rows, sees %', (select count(*) from analytics_breakdowns); end if;
    if (select count(*) from analytics_retention) <> 1 then raise exception 'FAIL 1: a teammate should see 1 curve'; end if;
    if (select (metrics->>'red_views')::int from analytics_content where external_id = 'vid1') <> 40 then raise exception 'FAIL 1: a video''s other numbers aren''t readable'; end if;
    begin
      insert into analytics_breakdowns (team_id, platform, dimension, key, day) values ('10000000-0000-4000-8000-00000000000a', 'youtube', 'device', 'MOBILE', current_date);
      raise exception 'FAIL 1: a person wrote a breakdown';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into analytics_retention (team_id, platform, external_id, points) values ('10000000-0000-4000-8000-00000000000a', 'youtube', 'x', '[]');
      raise exception 'FAIL 1: a person wrote a curve';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_breakdowns) <> 1 then raise exception 'FAIL 1: team H should only see its own breakdown'; end if;
    if exists (select 1 from analytics_retention where external_id = 'vid1') then raise exception 'FAIL 1: team H sees team G''s curve'; end if;
  end $$;
rollback;

-- 1b. Adding up the per-day splits: only your own team's rows, weighted averages.
insert into analytics_breakdowns (team_id, platform, external_id, dimension, key, day, span, views, watch_minutes, value) values
  ('10000000-0000-4000-8000-00000000000a', 'youtube', '', 'subscribed', 'SUBSCRIBED', current_date - 2, 1, 100, 50, 80),
  ('10000000-0000-4000-8000-00000000000a', 'youtube', '', 'subscribed', 'SUBSCRIBED', current_date - 1, 1, 300, 90, 40),
  ('10000000-0000-4000-8000-00000000000a', 'youtube', '', 'subscribed', 'SUBSCRIBED', current_date - 40, 1, 999, 9, 1);
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  set local role authenticated;
  do $$
  declare
    r record;
  begin
    select * into r from analytics_breakdown_sums('10000000-0000-4000-8000-00000000000a', 'youtube', current_date - 7, current_date) where dimension = 'subscribed';
    if r.views <> 400 or r.watch_minutes <> 140 or r.days <> 2 then raise exception 'FAIL 1b: sums wrong (% views, % minutes, % days)', r.views, r.watch_minutes, r.days; end if;
    if round(r.value) <> 50 then raise exception 'FAIL 1b: the average should be weighted by views (50), got %', r.value; end if;
    if exists (select 1 from analytics_breakdown_sums('10000000-0000-4000-8000-00000000000b', 'youtube', current_date - 7, current_date)) then
      raise exception 'FAIL 1b: another team''s rows were added up';
    end if;
  end $$;
rollback;

-- 2. Each video's money: masters and the people chosen to see revenue only.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_content_revenue) <> 1 then raise exception 'FAIL 2: the master should see 1 video''s money'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_content_revenue) <> 0 then raise exception 'FAIL 2: a teammate without revenue sees video money'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a4');
  set local role authenticated;
  do $$ begin
    if (select count(*) from analytics_content_revenue) <> 1 then raise exception 'FAIL 2: a teammate chosen to see revenue should see the video money'; end if;
    begin
      update analytics_content_revenue set revenue = 1;
      if (select revenue from analytics_content_revenue where external_id = 'vid1') = 1 then raise exception 'FAIL 2: a person changed video money'; end if;
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 3. Shapes: metrics are an object, the window is one of the known ones.
do $$ begin
  begin
    insert into analytics_daily (team_id, platform, day, content, metrics) values ('10000000-0000-4000-8000-00000000000a', 'youtube', current_date, 'all', '[1]');
    raise exception 'FAIL 3: metrics took an array';
  exception when check_violation then null;
  end;
  begin
    insert into analytics_breakdowns (team_id, platform, dimension, key, day, span) values ('10000000-0000-4000-8000-00000000000a', 'youtube', 'device', 'TV', current_date, 14);
    raise exception 'FAIL 3: a 14-day window was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into analytics_breakdowns (team_id, platform, dimension, key, day) values ('10000000-0000-4000-8000-00000000000a', 'youtube', 'Bad Name!', 'TV', current_date);
    raise exception 'FAIL 3: an odd dimension name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into analytics_retention (team_id, platform, external_id, points) values ('10000000-0000-4000-8000-00000000000a', 'youtube', 'v2', '{"a": 1}');
    raise exception 'FAIL 3: a curve that isn''t a list was accepted';
  exception when check_violation then null;
  end;
end $$;

-- 4. Frames: the short's editor adds them; the version gets them; nobody else.
insert into short_videos (id, team_id, title, editor_member_id, created_by) values
  ('50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a', 'Street food', '20000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1');
insert into storage.objects (bucket_id, name) values
  ('review-videos', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/clip.mp4');
insert into short_video_versions (id, short_id, storage_path, file_name, size_bytes, mime_type) values
  ('60000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/clip.mp4', 'clip.mp4', 1000, 'video/mp4');

-- Someone in another team can't put frames in this short's folder.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  set local role authenticated;
  do $$ begin
    begin
      insert into storage.objects (bucket_id, name) values ('video-frames', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
      raise exception 'FAIL 4: another team added frames';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
-- A teammate who isn't the editor can't either.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  set local role authenticated;
  do $$ begin
    begin
      insert into storage.objects (bucket_id, name) values ('video-frames', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
      raise exception 'FAIL 4: a researcher added frames';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
-- The editor: the wrong name and a missing file are refused, the right one is saved.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  set local role authenticated;
  do $$ begin
    begin
      perform set_version_frames('60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
      raise exception 'FAIL 4: frames saved before the file was uploaded';
    exception when check_violation then null;
    end;
  end $$;
  insert into storage.objects (bucket_id, name) values ('video-frames', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
  insert into storage.objects (bucket_id, name) values ('video-frames', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/other.jpg');
  do $$ begin
    begin
      perform set_version_frames('60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/other.jpg');
      raise exception 'FAIL 4: another file name was accepted';
    exception when check_violation then null;
    end;
    perform set_version_frames('60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
  end $$;
commit;
do $$ begin
  if (select frames_path from short_video_versions where id = '60000000-0000-4000-8000-0000000000a1') is distinct from '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg' then
    raise exception 'FAIL 4: the frames weren''t saved on the version';
  end if;
end $$;
-- A teammate reads them (not another team), and can't set them.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a3');
  set local role authenticated;
  do $$ begin
    if not exists (select 1 from storage.objects where bucket_id = 'video-frames' and name like '10000000-0000-4000-8000-00000000000a/%') then raise exception 'FAIL 4: a teammate can''t read the frames'; end if;
    begin
      perform set_version_frames('60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/60000000-0000-4000-8000-0000000000a1.jpg');
      raise exception 'FAIL 4: a researcher set frames';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from storage.objects where bucket_id = 'video-frames') then raise exception 'FAIL 4: another team reads the frames'; end if;
  end $$;
rollback;
-- A version never arrives with frames already set.
insert into storage.objects (bucket_id, name) values
  ('review-videos', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/clip2.mp4');
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  set local role authenticated;
  insert into short_video_versions (id, short_id, storage_path, file_name, size_bytes, mime_type, frames_path) values
    ('60000000-0000-4000-8000-0000000000a2', '50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-0000000000a1/clip2.mp4', 'clip2.mp4', 1000, 'video/mp4',
     '10000000-0000-4000-8000-00000000000b/x/y.jpg');
commit;
do $$ begin
  if (select frames_path from short_video_versions where id = '60000000-0000-4000-8000-0000000000a2') is not null then raise exception 'FAIL 4: a version arrived with frames set'; end if;
end $$;
