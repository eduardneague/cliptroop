-- Checks for 0088: the channel's Live tab decides whether a YouTube video is
-- a live stream (a premiere is a video, whatever its live details or
-- YouTube Analytics say); without it, YouTube's creatorContentType decides
-- (0086); other platforms keep their own kind; analytics_syncs has room for
-- the count ratio. Run by scripts/db/test-from-scratch.sh; each check raises
-- on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a8', 'live-tab-a@example.com') on conflict do nothing;
insert into profiles (id, email) values ('00000000-0000-4000-8000-0000000000a8', 'live-tab-a@example.com') on conflict do nothing;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-0000000000a8', 'Team C8', 'live-tab-team', '00000000-0000-4000-8000-0000000000a8');

insert into analytics_content (team_id, platform, external_id, kind, content_type, live_tab, title, published_at) values
  -- A premiere: the copy guessed a live stream from its details; not on the Live tab.
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'prem1', 'live', null, false, 'A premiere', now() - interval '20 days'),
  -- A premiere YouTube Analytics calls a live stream.
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'prem2', 'long', 'LIVE_STREAM', false, 'Another premiere', now() - interval '20 days'),
  -- A real stream, on the Live tab (whatever else was said).
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'live1', 'long', 'VIDEO_ON_DEMAND', true, 'A stream', now() - interval '20 days'),
  -- Not known yet: YouTube Analytics' word.
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'live2', 'long', 'LIVE_STREAM', null, 'Another stream', now() - interval '20 days'),
  -- A Short with live details somehow, not on the Live tab: still a Short.
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'short1', 'live', 'SHORTS', false, 'A short', now() - interval '20 days'),
  -- An ordinary video, not on the Live tab: stays a long video.
  ('10000000-0000-4000-8000-0000000000a8', 'youtube', 'vod1', 'long', null, false, 'A video', now() - interval '20 days'),
  -- Other platforms: their own kind.
  ('10000000-0000-4000-8000-0000000000a8', 'facebook', 'fb1', 'live', null, false, 'A Facebook live', now() - interval '20 days');

do $$
declare
  k text;
begin
  if (select kind from analytics_content where external_id = 'prem1') <> 'long' then raise exception 'a premiere off the Live tab is a long video'; end if;
  if (select kind from analytics_content where external_id = 'prem2') <> 'long' then raise exception 'the Live tab beats YouTube Analytics'' LIVE_STREAM'; end if;
  if (select kind from analytics_content where external_id = 'live1') <> 'live' then raise exception 'on the Live tab is a live stream'; end if;
  if (select kind from analytics_content where external_id = 'live2') <> 'live' then raise exception 'without the Live tab, LIVE_STREAM decides'; end if;
  if (select kind from analytics_content where external_id = 'short1') <> 'short' then raise exception 'a Short stays a Short'; end if;
  if (select kind from analytics_content where external_id = 'vod1') <> 'long' then raise exception 'an ordinary video stays a long video'; end if;
  if (select kind from analytics_content where external_id = 'fb1') <> 'live' then raise exception 'only YouTube''s Live tab counts'; end if;

  -- The copy's next upsert guesses "live" again from the details: the Live tab still decides.
  update analytics_content set kind = 'live' where external_id = 'prem1';
  select kind into k from analytics_content where external_id = 'prem1';
  if k <> 'long' then raise exception 'a later guess doesn''t undo it (got %)', k; end if;
  -- Found on the Live tab later: a live stream.
  update analytics_content set live_tab = true where external_id = 'vod1';
  select kind into k from analytics_content where external_id = 'vod1';
  if k <> 'live' then raise exception 'joining the Live tab makes it a live stream (got %)', k; end if;

  if not exists (select 1 from information_schema.columns where table_name = 'analytics_syncs' and column_name = 'live_ratio' and data_type = 'jsonb') then
    raise exception 'analytics_syncs.live_ratio is there';
  end if;
end $$;
