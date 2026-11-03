-- Checks for 0093 (part one): the glass look's new choices and saved
-- wallpapers. Run by scripts/db/test-from-scratch.sh; each check raises on
-- failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M and N.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009e1', 'm-walls@example.com'),
  ('00000000-0000-4000-8000-0000000009e2', 'n-walls@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000009e1', 'm-walls@example.com'),
  ('00000000-0000-4000-8000-0000000009e2', 'n-walls@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Glass: simple, cards and bars, solid side bar, 50 % by default; only known values.
do $$
begin
  if not (select glass_style = 'simple' and glass_scope = 'cards' and not glass_sidebar and glass_level = 50 from profiles where id = '00000000-0000-4000-8000-0000000009e1') then
    raise exception '1: the glass choices should start simple / cards / solid / 50';
  end if;
  begin
    update profiles set glass_style = 'chrome' where id = '00000000-0000-4000-8000-0000000009e1';
    raise exception '1: an unknown style should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_scope = 'all' where id = '00000000-0000-4000-8000-0000000009e1';
    raise exception '1: an unknown scope should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_level = 101 where id = '00000000-0000-4000-8000-0000000009e1';
    raise exception '1: level 101 should be refused';
  exception when check_violation then null;
  end;
end;
$$;

-- 2. Signed in: your own glass choices (column grants), not someone else's (RLS).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  update profiles set glass_ui = true, glass_style = 'liquid', glass_scope = 'everywhere', glass_sidebar = true, glass_level = 80 where id = '00000000-0000-4000-8000-0000000009e1';
  update profiles set glass_style = 'liquid' where id = '00000000-0000-4000-8000-0000000009e2';
commit;
do $$
begin
  if not (select glass_style = 'liquid' and glass_scope = 'everywhere' and glass_sidebar and glass_level = 80 from profiles where id = '00000000-0000-4000-8000-0000000009e1') then
    raise exception '2: your own glass choices should be saved';
  end if;
  if (select glass_style from profiles where id = '00000000-0000-4000-8000-0000000009e2') <> 'simple' then
    raise exception '2: someone else''s glass must not change';
  end if;
end;
$$;

-- 3. Wallpapers: yours, in your folder, three at most; the user and date are set by the database.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  insert into profile_wallpapers (path, luma) values ('00000000-0000-4000-8000-0000000009e1/1-dusk.jpg', 22);
  insert into profile_wallpapers (path, luma) values ('00000000-0000-4000-8000-0000000009e1/2-meadow.webp', 78);
  insert into profile_wallpapers (path) values ('00000000-0000-4000-8000-0000000009e1/3-city.webm');
commit;
do $$
begin
  if (select count(*) from profile_wallpapers where user_id = '00000000-0000-4000-8000-0000000009e1') <> 3 then
    raise exception '3: three wallpapers should be saved';
  end if;
end;
$$;
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  begin
    insert into profile_wallpapers (path) values ('00000000-0000-4000-8000-0000000009e1/4-more.png');
    raise exception '3: a fourth wallpaper should be refused';
  exception when raise_exception then
    if sqlerrm not like '%3 wallpapers%' then raise; end if;
  end;
  reset role;
end;
$$;
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009e2');
  set local role authenticated;
  begin
    insert into profile_wallpapers (path) values ('00000000-0000-4000-8000-0000000009e1/theirs.png');
    raise exception '3: a file in someone else''s folder should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into profile_wallpapers (path) values ('00000000-0000-4000-8000-0000000009e2/page.html');
    raise exception '3: a file that isn''t a picture or a video should be refused';
  exception when check_violation then null;
  end;
  begin
    insert into profile_wallpapers (user_id, path) values ('00000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-0000000009e1/x.png');
    raise exception '3: choosing whose wallpaper it is should be refused';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into profile_wallpapers (path, luma) values ('00000000-0000-4000-8000-0000000009e2/bright.png', 101);
    raise exception '3: luma 101 should be refused';
  exception when check_violation then null;
  end;
  reset role;
end;
$$;

-- 4. Only yours: N sees, changes and removes none of M's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e2');
  set local role authenticated;
  create temp table seen on commit drop as select count(*) as n from profile_wallpapers;
  update profile_wallpapers set luma = 1 where user_id = '00000000-0000-4000-8000-0000000009e1';
  delete from profile_wallpapers where user_id = '00000000-0000-4000-8000-0000000009e1';
  do $$
  begin
    if (select n from seen) <> 0 then raise exception '4: someone else''s wallpapers should be hidden'; end if;
  end;
  $$;
commit;
do $$
begin
  if (select count(*) from profile_wallpapers where user_id = '00000000-0000-4000-8000-0000000009e1' and luma is distinct from 1) <> 3 then
    raise exception '4: M''s wallpapers must not change';
  end if;
end;
$$;

-- 5. The one in use follows: replaced → the new file; removed → the newest other one; the last → the background off.
update profiles set dashboard_bg_path = '00000000-0000-4000-8000-0000000009e1/1-dusk.jpg', dashboard_bg_on = true where id = '00000000-0000-4000-8000-0000000009e1';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  update profile_wallpapers set path = '00000000-0000-4000-8000-0000000009e1/5-dawn.avif', luma = 40 where path = '00000000-0000-4000-8000-0000000009e1/1-dusk.jpg';
commit;
do $$
begin
  if (select dashboard_bg_path from profiles where id = '00000000-0000-4000-8000-0000000009e1') <> '00000000-0000-4000-8000-0000000009e1/5-dawn.avif' then
    raise exception '5: replacing the one in use should keep it in use';
  end if;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  delete from profile_wallpapers where path = '00000000-0000-4000-8000-0000000009e1/5-dawn.avif';
commit;
do $$
begin
  if (select dashboard_bg_path from profiles where id = '00000000-0000-4000-8000-0000000009e1') <> '00000000-0000-4000-8000-0000000009e1/3-city.webm'
     or not (select dashboard_bg_on from profiles where id = '00000000-0000-4000-8000-0000000009e1') then
    raise exception '5: removing the one in use should switch to the newest other one';
  end if;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009e1');
  set local role authenticated;
  delete from profile_wallpapers where user_id = '00000000-0000-4000-8000-0000000009e1';
commit;
do $$
begin
  if (select dashboard_bg_path is not null or dashboard_bg_on from profiles where id = '00000000-0000-4000-8000-0000000009e1') then
    raise exception '5: removing the last one should turn the background off';
  end if;
end;
$$;

-- 6. A wallpaper stays with its owner.
insert into profile_wallpapers (user_id, path) values ('00000000-0000-4000-8000-0000000009e2', '00000000-0000-4000-8000-0000000009e2/mine.png');
do $$
begin
  begin
    update profile_wallpapers set user_id = '00000000-0000-4000-8000-0000000009e1' where user_id = '00000000-0000-4000-8000-0000000009e2';
    raise exception '6: moving a wallpaper to someone else should be refused';
  exception when insufficient_privilege or check_violation then null;
  end;
end;
$$;
