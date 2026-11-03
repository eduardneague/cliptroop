-- Checks for 0096 (the colours behind the glass) and 0097 (the Halo style).
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: W (picks colours) and X (someone else).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000096a1', 'w-wash@example.com'),
  ('00000000-0000-4000-8000-0000000096a2', 'x-wash@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000096a1', 'w-wash@example.com'),
  ('00000000-0000-4000-8000-0000000096a2', 'x-wash@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Nobody has colours of their own to start with: the theme's (null), no custom colours.
do $$
begin
  if exists (select 1 from profiles where id = '00000000-0000-4000-8000-0000000096a1' and (glass_wash is not null or glass_wash_colors is not null)) then
    raise exception '1: the colours behind the glass should start as the theme''s';
  end if;
end;
$$;

-- 2. Only sensible values: a short lower-case name, one to three #rrggbb colours.
do $$
begin
  update profiles set glass_wash = 'ink' where id = '00000000-0000-4000-8000-0000000096a1';
  update profiles set glass_wash = 'custom', glass_wash_colors = array['#ff7a18', '#ff3d77', '#7b2ff7'] where id = '00000000-0000-4000-8000-0000000096a1';
  update profiles set glass_wash = null where id = '00000000-0000-4000-8000-0000000096a1';
  begin
    update profiles set glass_wash = 'Ocean; drop table profiles' where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '2: a name that isn''t short and lower case should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_wash_colors = array['#ff7a18', 'red'] where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '2: a colour that isn''t #rrggbb should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_wash_colors = array['#ff7a18', '#ff3d77', '#7b2ff7', '#000000'] where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '2: four colours should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_wash_colors = array['#ff7a18', null] where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '2: an empty colour should be refused';
  exception when check_violation then null;
  end;
  begin
    update profiles set glass_wash_colors = array['#FF7A18'] where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '2: colours are stored lower case';
  exception when check_violation then null;
  end;
  update profiles set glass_wash_colors = null where id = '00000000-0000-4000-8000-0000000096a1';
end;
$$;

-- 3. Signed in: your own colours (column grants), not someone else's (RLS).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000096a1');
  set local role authenticated;
  update profiles set glass_wash = 'sunset', glass_wash_colors = array['#e8630d', '#8b5cf6', '#0ea5e9'] where id = '00000000-0000-4000-8000-0000000096a1';
  update profiles set glass_wash = 'none' where id = '00000000-0000-4000-8000-0000000096a2';
commit;
do $$
begin
  if not (select glass_wash = 'sunset' and glass_wash_colors = array['#e8630d', '#8b5cf6', '#0ea5e9'] from profiles where id = '00000000-0000-4000-8000-0000000096a1') then
    raise exception '3: your own colours should be saved';
  end if;
  if (select glass_wash from profiles where id = '00000000-0000-4000-8000-0000000096a2') is not null then
    raise exception '3: someone else''s colours must not change';
  end if;
end;
$$;

-- 4. 0097: Halo is a style; unknown ones still aren't; signed in, you can pick it.
do $$
begin
  update profiles set glass_style = 'halo' where id = '00000000-0000-4000-8000-0000000096a1';
  update profiles set glass_style = 'simple' where id = '00000000-0000-4000-8000-0000000096a1';
  begin
    update profiles set glass_style = 'chrome' where id = '00000000-0000-4000-8000-0000000096a1';
    raise exception '4: an unknown style should still be refused';
  exception when check_violation then null;
  end;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000096a1');
  set local role authenticated;
  update profiles set glass_style = 'halo' where id = '00000000-0000-4000-8000-0000000096a1';
commit;
do $$
begin
  if (select glass_style from profiles where id = '00000000-0000-4000-8000-0000000096a1') <> 'halo' then
    raise exception '4: you should be able to pick Halo';
  end if;
end;
$$;
