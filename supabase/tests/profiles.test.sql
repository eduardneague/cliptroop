-- Checks for 0093 (part two): XP, levels, frames, profile pages and their
-- privacy. Run by scripts/db/test-from-scratch.sh; each check raises on
-- failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: P (does the work) and Q (looks at P's profile). Team T.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009f1', 'p-prof@example.com'),
  ('00000000-0000-4000-8000-0000000009f2', 'q-prof@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000009f1', 'p-prof@example.com'),
  ('00000000-0000-4000-8000-0000000009f2', 'q-prof@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000009f1', 'Team T', 'profiles-t', '00000000-0000-4000-8000-0000000009f1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Levels: 100 XP a level up to 10, 200 up to 20, 300 up to 30.
do $$
begin
  if vp_level_for(0) <> 0 or vp_level_for(99) <> 0 or vp_level_for(100) <> 1 or vp_level_for(999) <> 9 or vp_level_for(1000) <> 10
     or vp_level_for(2999) <> 19 or vp_level_for(3000) <> 20 or vp_level_for(4500) <> 25 or vp_level_for(5460) <> 28 or vp_level_for(15000) <> 50 then
    raise exception '1: vp_level_for is off';
  end if;
  if vp_level_floor(10) <> 1000 or vp_level_floor(28) <> 5400 or vp_level_floor(50) <> 15000 then
    raise exception '1: vp_level_floor is off';
  end if;
end;
$$;

-- 2. XP: each step of each video once, only when it was your turn, a quarter more on time.
insert into tasks (team_id, user_id, kind, item_id, stage, state, due_date, activated_at, completed_at) values
  -- A long video's edit, done before its date: 90 + 23.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'long', '20000000-0000-4000-8000-0000000009f1', 'edit', 'done', current_date + 1, now() - interval '3 days', now() - interval '1 day'),
  -- The same edit again (the video went back and came through again): nothing more.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'long', '20000000-0000-4000-8000-0000000009f1', 'edit', 'done', current_date + 1, now() - interval '20 hours', now() - interval '10 hours'),
  -- A step the video skipped (never their turn): nothing.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'long', '20000000-0000-4000-8000-0000000009f1', 'film', 'done', current_date + 1, null, now() - interval '1 day'),
  -- A short's script, late: 30.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'short', '20000000-0000-4000-8000-0000000009f2', 'script', 'done', current_date - 3, now() - interval '2 days', now()),
  -- A meeting action item without a date: 10.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'meeting', '20000000-0000-4000-8000-0000000009f3', 'action', 'done', null, now() - interval '2 days', now()),
  -- Still to do: nothing yet.
  ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f1', 'short', '20000000-0000-4000-8000-0000000009f4', 'editing', 'active', current_date + 2, now(), null);
do $$
begin
  if profile_xp('00000000-0000-4000-8000-0000000009f1') <> 153 then
    raise exception '2: P should have 153 XP, has %', profile_xp('00000000-0000-4000-8000-0000000009f1');
  end if;
end;
$$;

-- 3. profile_stats: yours, and anyone's public one; counted the same way.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f2');
  set local role authenticated;
  create temp table st on commit drop as select profile_stats('00000000-0000-4000-8000-0000000009f1') as j;
  do $$
  declare
    j jsonb := (select j from st);
  begin
    if j is null then raise exception '3: a public profile''s numbers should be there'; end if;
    if (j->>'xp')::int <> 153 or (j->>'tasks')::int <> 3 or (j->>'on_time')::int <> 1 or (j->>'dated')::int <> 2 or (j->>'videos')::int <> 2 or (j->>'teams')::int <> 1 then
      raise exception '3: the numbers are off: %', j;
    end if;
    if (j->'by'->>'edit')::int <> 1 or (j->'by'->>'script')::int <> 1 or (j->'by'->>'action')::int <> 1 or j->'by' ? 'film' then
      raise exception '3: the kinds are off: %', j->'by';
    end if;
    if j->'ranks'->'all'->>'1' is null or j->'ranks'->'edit'->>'1' is null or (j->'streak'->>'best')::int < 1 then
      raise exception '3: the dates are off: %', j;
    end if;
  end;
  $$;
commit;

-- 4. Private: others get nothing (not the numbers, not the page); you still get yours.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  insert into profile_pages (public, bio) values (false, 'Editor.');
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f2');
  set local role authenticated;
  do $$
  begin
    if profile_stats('00000000-0000-4000-8000-0000000009f1') is not null then raise exception '4: a private profile''s numbers must be hidden'; end if;
    if exists (select 1 from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f1') then raise exception '4: a private page must be hidden'; end if;
  end;
  $$;
  -- Nor can they change it, or make one in P's name.
  update profile_pages set public = true where user_id = '00000000-0000-4000-8000-0000000009f1';
  insert into profile_pages (public) values (true);
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  do $$
  begin
    if profile_stats('00000000-0000-4000-8000-0000000009f1') is null then raise exception '4: your own numbers should be there'; end if;
    if (select public from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f1') then raise exception '4: P''s page must stay private'; end if;
  end;
  $$;
commit;
do $$
begin
  if not exists (select 1 from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f2') then
    raise exception '4: Q''s insert should have made Q''s own page';
  end if;
end;
$$;

-- 5. Frames: only once you've reached their level (P is level 1).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  update profile_pages set frame = 'ring' where user_id = '00000000-0000-4000-8000-0000000009f1';
commit;
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  begin
    update profile_pages set frame = 'glow' where user_id = '00000000-0000-4000-8000-0000000009f1';
    raise exception '5: a frame above your level should be refused';
  exception when raise_exception then
    if sqlerrm not like 'Reach level 5%' then raise; end if;
  end;
  begin
    update profile_pages set frame = 'golden' where user_id = '00000000-0000-4000-8000-0000000009f1';
    raise exception '5: an unknown frame should be refused';
  exception when check_violation then null;
  end;
  begin
    update profile_pages set bio = repeat('x', 301) where user_id = '00000000-0000-4000-8000-0000000009f1';
    raise exception '5: a bio over 300 characters should be refused';
  exception when check_violation then null;
  end;
  reset role;
end;
$$;

-- 6. A background: only one of your wallpapers (its brightness comes along); it goes when the wallpaper goes.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  insert into profile_wallpapers (path, luma) values ('00000000-0000-4000-8000-0000000009f1/sky.jpg', 81);
  update profile_pages set bg_path = '00000000-0000-4000-8000-0000000009f1/sky.jpg' where user_id = '00000000-0000-4000-8000-0000000009f1';
commit;
do $$
begin
  if (select bg_luma from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f1') is distinct from 81::smallint then
    raise exception '6: the background''s brightness should come from the wallpaper';
  end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  begin
    update profile_pages set bg_path = '00000000-0000-4000-8000-0000000009f1/not-saved.jpg' where user_id = '00000000-0000-4000-8000-0000000009f1';
    raise exception '6: a file that isn''t one of your wallpapers should be refused';
  exception when raise_exception then
    if sqlerrm like '6:%' then raise; end if;
  end;
  begin
    update profile_pages set bg_path = '00000000-0000-4000-8000-0000000009f2/theirs.jpg' where user_id = '00000000-0000-4000-8000-0000000009f1';
    raise exception '6: someone else''s folder should be refused';
  exception when check_violation or raise_exception then
    if sqlerrm like '6:%' then raise; end if;
  end;
  reset role;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  update profile_wallpapers set path = '00000000-0000-4000-8000-0000000009f1/sky-2.jpg', luma = 12 where path = '00000000-0000-4000-8000-0000000009f1/sky.jpg';
commit;
do $$
begin
  if (select bg_path || ':' || bg_luma from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f1') <> '00000000-0000-4000-8000-0000000009f1/sky-2.jpg:12' then
    raise exception '6: replacing the wallpaper should move the background along';
  end if;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  set local role authenticated;
  delete from profile_wallpapers where path = '00000000-0000-4000-8000-0000000009f1/sky-2.jpg';
commit;
do $$
begin
  if (select bg_path is not null or bg_luma is not null from profile_pages where user_id = '00000000-0000-4000-8000-0000000009f1') then
    raise exception '6: removing the wallpaper should take the background off';
  end if;
end;
$$;

-- 7. Signed out: nothing.
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  if profile_stats('00000000-0000-4000-8000-0000000009f1') is not null then
    raise exception '7: no numbers without signing in';
  end if;
end;
$$;

-- 8. Leaving a team: anyone but the owner; then they're on it no more.
insert into team_members (team_id, user_id, invited_email, status) values ('10000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000009f2', 'q-prof@example.com', 'active');
do $$
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009f1');
  begin
    perform leave_team('10000000-0000-4000-8000-0000000009f1');
    raise exception '8: the owner shouldn''t be able to leave';
  exception when raise_exception then
    if sqlerrm not like 'You own this team%' then raise; end if;
  end;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009f2');
  set local role authenticated;
  select leave_team('10000000-0000-4000-8000-0000000009f1');
commit;
do $$
begin
  if exists (select 1 from team_members where team_id = '10000000-0000-4000-8000-0000000009f1' and user_id = '00000000-0000-4000-8000-0000000009f2') then
    raise exception '8: Q should be off the team';
  end if;
  perform pg_temp.as_user('00000000-0000-4000-8000-0000000009f2');
  begin
    perform leave_team('10000000-0000-4000-8000-0000000009f1');
    raise exception '8: leaving twice should say so';
  exception when no_data_found then null;
  end;
end;
$$;
