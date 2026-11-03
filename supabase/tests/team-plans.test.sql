-- Checks for 0124: a plan for each team, asking for one, and the storage each team uses.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- O: signs up on the website and makes a team. E: an editor in it. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000124a1', 'o124@example.com'),
  ('00000000-0000-4000-8000-0000000124a2', 'e124@example.com'),
  ('00000000-0000-4000-8000-0000000124b1', 'x124@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%124@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000124b0', 'Other 124', 'other-124', '00000000-0000-4000-8000-0000000124b1')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. A team made in the app starts with no plan, whatever it was sent with.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000124a1');
  set local role authenticated;
  insert into teams (id, name, slug, owner_id, plan, plan_storage_gb, plan_requested)
  values ('10000000-0000-4000-8000-0000000124a0', 'Team 124', 'team-124', '00000000-0000-4000-8000-0000000124a1', 'network', 9999, 'studio');
commit;
do $$
begin
  if exists (select 1 from teams where id = '10000000-0000-4000-8000-0000000124a0' and (plan is not null or plan_storage_gb is not null or plan_requested is not null)) then
    raise exception '1: a new team must start without a plan or a request';
  end if;
end;
$$;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000124a2', '10000000-0000-4000-8000-0000000124a0', '00000000-0000-4000-8000-0000000124a2', 'e124@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values ('30000000-0000-4000-8000-0000000124a2', 'editor') on conflict do nothing;

-- 2. Its owner can't give it a plan (the columns aren't theirs to change), but can still rename it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000124a1');
  set local role authenticated;
  do $$ begin
    begin
      update teams set plan = 'network', plan_storage_gb = 5000, plan_set_at = now() where id = '10000000-0000-4000-8000-0000000124a0';
      raise exception 'FAIL 2: a team''s owner gave it a plan';
    exception when insufficient_privilege then null;
    end;
    begin
      update teams set plan_requested = 'network' where id = '10000000-0000-4000-8000-0000000124a0';
      raise exception 'FAIL 2: a request written straight into the team';
    exception when insufficient_privilege then null;
    end;
  end $$;
  update teams set name = 'Team 124 renamed' where id = '10000000-0000-4000-8000-0000000124a0';
commit;
do $$
begin
  if (select plan from teams where id = '10000000-0000-4000-8000-0000000124a0') is not null then
    raise exception '2: nobody signed in gives a team a plan';
  end if;
  if (select name from teams where id = '10000000-0000-4000-8000-0000000124a0') <> 'Team 124 renamed' then
    raise exception '2: the rest of a change still goes through';
  end if;
end;
$$;

-- 3. Its master asks for one (the note tidied, kept to 1,000 characters); an editor, another team's master or a plan
--    that doesn't exist: refused.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000124a1');
  set local role authenticated;
  select request_team_plan('10000000-0000-4000-8000-0000000124a0', 'studio', '   ' || repeat('n', 1200) || '   ');
commit;
do $$
begin
  if not exists (
    select 1 from teams
     where id = '10000000-0000-4000-8000-0000000124a0' and plan_requested = 'studio' and plan_requested_at is not null
       and char_length(plan_request_note) = 1000 and plan_requested_by = '00000000-0000-4000-8000-0000000124a1' and plan is null
  ) then
    raise exception '3: a master''s request should be kept (and give no plan by itself)';
  end if;
end;
$$;
do $$
begin
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000124a2', true);
    perform request_team_plan('10000000-0000-4000-8000-0000000124a0', 'network', null);
    raise exception '3: an editor must not ask for a plan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000124b1', true);
    perform request_team_plan('10000000-0000-4000-8000-0000000124a0', 'network', null);
    raise exception '3: another team''s master must not ask for this one';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000124a1', true);
    perform request_team_plan('10000000-0000-4000-8000-0000000124a0', 'free', null);
    raise exception '3: a plan that doesn''t exist must be refused';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select plan_requested from teams where id = '10000000-0000-4000-8000-0000000124a0') <> 'studio' then
    raise exception '3: a refused request must leave the last one as it was';
  end if;
end;
$$;

-- 4. ClipTroop (the service role, here the owner of the database) gives it a plan and its storage.
update teams set plan = 'studio', plan_storage_gb = 80, plan_set_at = now() where id = '10000000-0000-4000-8000-0000000124a0';
do $$
begin
  if not exists (select 1 from teams where id = '10000000-0000-4000-8000-0000000124a0' and plan = 'studio' and plan_storage_gb = 80) then
    raise exception '4: ClipTroop sets a team''s plan';
  end if;
  begin
    update teams set plan = 'crew' where id = '10000000-0000-4000-8000-0000000124a0';
    raise exception '4: only Studio or Network';
  exception when check_violation then null;
  end;
  begin
    update teams set plan_storage_gb = 0 where id = '10000000-0000-4000-8000-0000000124a0';
    raise exception '4: storage is at least 1 GB';
  exception when check_violation then null;
  end;
end;
$$;

-- 5. What the team's files take: its own folders, its long videos' and its scripts' folders; never another team's.
insert into storage.buckets (id, name) values ('thumbnails', 'thumbnails'), ('script-images', 'script-images'), ('review-videos', 'review-videos'), ('media-kit', 'media-kit')
on conflict do nothing;
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('30000000-0000-4000-8000-0000000124c1', '10000000-0000-4000-8000-0000000124a0', 'A long one', 'script', '00000000-0000-4000-8000-0000000124a1')
on conflict do nothing;
insert into scripts (id, long_video_id, kind, name, content_text) values
  ('70000000-0000-4000-8000-0000000124c1', '30000000-0000-4000-8000-0000000124c1', 'script', 'Script', '')
on conflict do nothing;
insert into storage.objects (bucket_id, name, metadata) values
  ('review-videos', '10000000-0000-4000-8000-0000000124a0/s1/cut.mp4', '{"size": 1000000}'),
  ('media-kit', '10000000-0000-4000-8000-0000000124a0/logo-1-a.webp', '{"size": 2000}'),
  ('thumbnails', '30000000-0000-4000-8000-0000000124c1/t.jpg', '{"size": 300}'),
  ('script-images', '70000000-0000-4000-8000-0000000124c1/p.png', '{"size": 40}'),
  ('review-videos', '10000000-0000-4000-8000-0000000124b0/s9/other.mp4', '{"size": 777777}'),
  ('media-kit', '10000000-0000-4000-8000-0000000124a0x/not-ours.webp', '{"size": 5}');
do $$
declare
  u jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000124a2', true);
  u := team_storage_usage('10000000-0000-4000-8000-0000000124a0');
  if (u ->> 'bytes')::bigint <> 1002340 or (u ->> 'files')::int <> 4 then
    raise exception '5: the team''s files should add up to 1002340 bytes in 4 files, not %', u;
  end if;
  if (u -> 'buckets' -> 0 ->> 'id') <> 'review-videos' then
    raise exception '5: biggest first';
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000124b1', true);
  if team_storage_usage('10000000-0000-4000-8000-0000000124a0') is not null then
    raise exception '5: someone outside the team sees nothing';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if (team_storage_usage('10000000-0000-4000-8000-0000000124a0') ->> 'bytes')::bigint <> 1002340 then
    raise exception '5: ClipTroop (no one signed in) sees it too';
  end if;
end;
$$;

-- 6. Files: a team without a plan adds none, not even its master in its own folder (its pages are closed too); with
--    one, it does. A profile picture isn't a team's: always. A team made by ClipTroop itself starts on Network.
insert into storage.buckets (id, name) values ('avatars', 'avatars') on conflict do nothing;
update teams set plan = null, plan_storage_gb = null where id = '10000000-0000-4000-8000-0000000124a0';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000124a1');
  set local role authenticated;
  do $$ begin
    begin
      insert into storage.objects (bucket_id, name, owner) values ('media-kit', '10000000-0000-4000-8000-0000000124a0/logo-2-b.webp', auth.uid());
      raise exception 'FAIL 6: a team without a plan added a file';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into storage.objects (bucket_id, name, owner) values ('thumbnails', '30000000-0000-4000-8000-0000000124c1/t2.jpg', auth.uid());
      raise exception 'FAIL 6: a file in its long video''s folder, without a plan';
    exception when insufficient_privilege then null;
    end;
  end $$;
  insert into storage.objects (bucket_id, name, owner) values ('avatars', '00000000-0000-4000-8000-0000000124a1/avatar-1.webp', auth.uid());
commit;
update teams set plan = 'studio' where id = '10000000-0000-4000-8000-0000000124a0';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000124a1');
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner) values ('media-kit', '10000000-0000-4000-8000-0000000124a0/logo-2-b.webp', auth.uid());
commit;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-0000000124d0', 'Made by ClipTroop 124', 'made-124', '00000000-0000-4000-8000-0000000124b1') on conflict do nothing;
do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'media-kit' and name = '10000000-0000-4000-8000-0000000124a0/logo-2-b.webp') then
    raise exception '6: with a plan, its master adds files';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-4000-8000-0000000124a1/avatar-1.webp') then
    raise exception '6: a profile picture is never a team''s';
  end if;
  if (select plan from teams where id = '10000000-0000-4000-8000-0000000124d0') is distinct from 'network' then
    raise exception '6: a team ClipTroop makes itself starts on Network';
  end if;
  if storage_team_of('script-images', '70000000-0000-4000-8000-0000000124c1/p.png') <> '10000000-0000-4000-8000-0000000124a0'
     or storage_team_of('avatars', '00000000-0000-4000-8000-0000000124a1/a.webp') is not null
     or storage_team_of('media-kit', 'not-a-uuid/x.webp') is not null then
    raise exception '6: whose a file is, by its folder';
  end if;
end;
$$;

delete from storage.objects where name like '10000000-0000-4000-8000-0000000124%' or name like '30000000-0000-4000-8000-0000000124%' or name like '70000000-0000-4000-8000-0000000124%' or name like '00000000-0000-4000-8000-0000000124%';
delete from teams where id = '10000000-0000-4000-8000-0000000124d0';
delete from teams where id in ('10000000-0000-4000-8000-0000000124a0', '10000000-0000-4000-8000-0000000124b0');
delete from profiles where id in ('00000000-0000-4000-8000-0000000124a1', '00000000-0000-4000-8000-0000000124a2', '00000000-0000-4000-8000-0000000124b1');
delete from auth.users where id in ('00000000-0000-4000-8000-0000000124a1', '00000000-0000-4000-8000-0000000124a2', '00000000-0000-4000-8000-0000000124b1');
