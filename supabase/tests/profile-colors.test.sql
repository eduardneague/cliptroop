-- Checks for 0099: a profile's colours (frame, XP bar, glow). Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000099c1', 'c-colors@example.com'),
  ('00000000-0000-4000-8000-0000000099c2', 'd-colors@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000099c1', 'c-colors@example.com'),
  ('00000000-0000-4000-8000-0000000099c2', 'd-colors@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. A new page starts with the level's colours; you can make yours with colours of your own (the app's upsert).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000099c1');
  set local role authenticated;
  insert into profile_pages (public) values (true);
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000099c2');
  set local role authenticated;
  insert into profile_pages (frame_color, bar_color, glow_color) values ('theme', '#3e63dd', 'off');
commit;
do $$
begin
  if (select frame_color || bar_color || glow_color from profile_pages where user_id = '00000000-0000-4000-8000-0000000099c1') <> 'levellevellevel' then
    raise exception '1: a new page should start with the level''s colours';
  end if;
  if (select frame_color || ' ' || bar_color || ' ' || glow_color from profile_pages where user_id = '00000000-0000-4000-8000-0000000099c2') <> 'theme #3e63dd off' then
    raise exception '1: a page made with colours should keep them';
  end if;
end;
$$;

-- 2. Yours to change: the theme's, a colour, the glow off.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000099c1');
  set local role authenticated;
  update profile_pages set frame_color = '#e2a300', bar_color = 'theme', glow_color = 'off' where user_id = '00000000-0000-4000-8000-0000000099c1';
  -- Not someone else's (their row isn't yours: nothing changes).
  update profile_pages set frame_color = '#000000' where user_id = '00000000-0000-4000-8000-0000000099c2';
commit;
do $$
begin
  if (select frame_color || ' ' || bar_color || ' ' || glow_color from profile_pages where user_id = '00000000-0000-4000-8000-0000000099c1') <> '#e2a300 theme off' then
    raise exception '2: your colours should change';
  end if;
  if (select frame_color from profile_pages where user_id = '00000000-0000-4000-8000-0000000099c2') <> 'theme' then
    raise exception '2: someone else''s colours must not change';
  end if;
end;
$$;

-- 3. Only the level's, the theme's or "#rrggbb" (lower case); "off" only for the glow.
do $$
declare
  bad text[][] := array[
    array['frame_color', 'off'],
    array['bar_color', 'off'],
    array['frame_color', '#FFF'],
    array['bar_color', '#E2A300'],
    array['glow_color', 'red'],
    array['frame_color', 'url(x)'],
    array['glow_color', '#12345']
  ];
  i int;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000099c1');
  set local role authenticated;
  for i in 1 .. array_length(bad, 1) loop
    begin
      execute format('update profile_pages set %I = %L where user_id = %L', bad[i][1], bad[i][2], '00000000-0000-4000-8000-0000000099c1');
      raise exception '3: % = % should be refused', bad[i][1], bad[i][2];
    exception when check_violation then null;
    end;
  end loop;
  reset role;
end;
$$;
