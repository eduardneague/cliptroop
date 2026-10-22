-- Checks for 0092: how long files stay (1 day to 1 year, or never) and each
-- person's glass look and dashboard background. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: K = master of team K1, L = someone else.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009d1', 'k-k1@example.com'),
  ('00000000-0000-4000-8000-0000000009d2', 'l-k1@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000009d1', 'k-k1@example.com'),
  ('00000000-0000-4000-8000-0000000009d2', 'l-k1@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000009d1', 'Team K1', 'keep-backgrounds-k1', '00000000-0000-4000-8000-0000000009d1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Today's choices stay; the defaults are unchanged.
do $$
begin
  if (select media_keep_days from teams where id = '10000000-0000-4000-8000-0000000009d1') <> 14
     or (select long_media_keep_days from teams where id = '10000000-0000-4000-8000-0000000009d1') <> 7
     or (select studio_keep_days from teams where id = '10000000-0000-4000-8000-0000000009d1') <> 30 then
    raise exception '1: a new team should keep 2 weeks / 1 week / 1 month';
  end if;
end;
$$;

-- 2. 1 day to 1 year, and never (null), for all three; nothing else.
do $$
declare
  v int;
begin
  foreach v in array array[1, 3, 7, 14, 21, 30, 60, 90, 180, 365] loop
    update teams set media_keep_days = v, long_media_keep_days = v, studio_keep_days = v where id = '10000000-0000-4000-8000-0000000009d1';
  end loop;
  update teams set media_keep_days = null, long_media_keep_days = null, studio_keep_days = null where id = '10000000-0000-4000-8000-0000000009d1';
  foreach v in array array[0, 2, 5, 45, 366] loop
    begin
      update teams set media_keep_days = v where id = '10000000-0000-4000-8000-0000000009d1';
      raise exception '2: media_keep_days = % should be refused', v;
    exception when check_violation then null;
    end;
    begin
      update teams set long_media_keep_days = v where id = '10000000-0000-4000-8000-0000000009d1';
      raise exception '2: long_media_keep_days = % should be refused', v;
    exception when check_violation then null;
    end;
    begin
      update teams set studio_keep_days = v where id = '10000000-0000-4000-8000-0000000009d1';
      raise exception '2: studio_keep_days = % should be refused', v;
    exception when check_violation then null;
    end;
  end loop;
end;
$$;

-- 3. The look and the background: off by default; your own folder, a picture or a video; dimmed 0–80 %.
do $$
begin
  if (select glass_ui or dashboard_bg_on or dashboard_bg_path is not null or dashboard_bg_dim <> 30 from profiles where id = '00000000-0000-4000-8000-0000000009d1') then
    raise exception '3: glass and the dashboard background should start off (dim 30)';
  end if;
  update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009d1/1761000000000-sunset.gif' where id = '00000000-0000-4000-8000-0000000009d1';
  update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009d1/loop.webm' where id = '00000000-0000-4000-8000-0000000009d1';
  begin
    update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009d2/theirs.png' where id = '00000000-0000-4000-8000-0000000009d1';
    raise exception '3: someone else''s folder should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009d1/page.html' where id = '00000000-0000-4000-8000-0000000009d1';
    raise exception '3: a file that isn''t a picture or a video should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009d1/../x.png' where id = '00000000-0000-4000-8000-0000000009d1';
    raise exception '3: a path that climbs out should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set dashboard_bg_dim = 81 where id = '00000000-0000-4000-8000-0000000009d1';
    raise exception '3: dim 81 should be refused';
  exception when check_violation then null;
  end;
end;
$$;

-- 4. Signed in: you change your own (the column grants), not someone else's (RLS).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009d1');
  set local role authenticated;
  update profiles set glass_ui = true, dashboard_bg_on = true, dashboard_bg_dim = 55 where id = '00000000-0000-4000-8000-0000000009d1';
  update profiles set glass_ui = true where id = '00000000-0000-4000-8000-0000000009d2';
commit;
do $$
begin
  if not (select glass_ui and dashboard_bg_on and dashboard_bg_dim = 55 from profiles where id = '00000000-0000-4000-8000-0000000009d1') then
    raise exception '4: your own look should be saved';
  end if;
  if (select glass_ui from profiles where id = '00000000-0000-4000-8000-0000000009d2') then
    raise exception '4: someone else''s look must not change';
  end if;
end;
$$;

-- 5. The bucket: public, pictures and videos only; 2 MB at most since 0098 (25 MB in 0092).
do $$
begin
  if not exists (
    select 1 from storage.buckets
     where id = 'dashboard-backgrounds' and public and file_size_limit = 2097152
       and allowed_mime_types @> array['image/gif', 'video/mp4'] and not (allowed_mime_types @> array['text/html'])
  ) then
    raise exception '5: the dashboard-backgrounds bucket should be public, 2 MB, pictures and videos';
  end if;
end;
$$;

-- 6. A master picks "never" through the team's columns (0070 / 0089 grants still cover them).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009d1');
  set local role authenticated;
  update teams set media_keep_days = null, long_media_keep_days = 365, studio_keep_days = 1 where id = '10000000-0000-4000-8000-0000000009d1';
commit;

\echo 'keep and backgrounds: all checks passed'
