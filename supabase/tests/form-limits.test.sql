-- Checks for 0108 (free text has a limit in the database too, 1.31.15), and
-- a guard for every migration after it: a text column a signed-in person
-- can write straight through the API has a limit (a check that names it),
-- or is listed here with what checks it instead. Then: a too-long comment,
-- hook and team name are refused; the app's own sizes go through; a new
-- username must look like one; an old one doesn't block saving the rest.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- 1. The guard.
do $$
declare
  r record;
  -- Checked some other way (a trigger), with the reason.
  checked_otherwise text[] := array[
    'profiles.username'  -- profiles_check_username (0108): 3 to 20 letters, numbers or underscores, when it changes
  ];
begin
  for r in
    -- Only a permissive policy lets anyone write (0125's restrictive "two-step sign-in" only narrows).
    with writable as (
      select c.oid, c.relname,
             exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('a', '*') and p.polpermissive) as ins_rule,
             exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('w', '*') and p.polpermissive) as upd_rule
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
    )
    select w.relname, a.attname
      from writable w join pg_attribute a on a.attrelid = w.oid
     where a.attnum > 0 and not a.attisdropped
       and format_type(a.atttypid, a.atttypmod) in ('text', 'jsonb', 'json', 'text[]', 'character varying', 'jsonb[]')
       and ((w.ins_rule and has_column_privilege('authenticated', w.oid, a.attname, 'insert'))
            or (w.upd_rule and has_column_privilege('authenticated', w.oid, a.attname, 'update')))
       and not exists (select 1 from pg_constraint k where k.conrelid = w.oid and k.contype in ('c', 'f')
                        and pg_get_constraintdef(k.oid) ~ ('\m' || a.attname || '\M'))
       and not (w.relname || '.' || a.attname) = any (checked_otherwise)
     order by 1, 2
  loop
    raise exception 'FAIL 1: %.% is text a signed-in person can write through the API with no limit: add a check (0108 shows how)', r.relname, r.attname;
  end loop;
end $$;

-- People and a team: Lia (master of Team L, writes everything), with a long video.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000108a01', 'lia.q@mail108.example') on conflict do nothing;
insert into profiles (id, email) values ('00000000-0000-4000-8000-000000108a01', 'lia.q@mail108.example') on conflict do nothing;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-000000108a01', 'Team L', 'limits-l', '00000000-0000-4000-8000-000000108a01') on conflict do nothing;
insert into long_video_projects (id, team_id, title, theme, hook, created_by)
values ('20000000-0000-4000-8000-000000108a01', '10000000-0000-4000-8000-000000108a01', 'A video', 'Science', 'A hook', '00000000-0000-4000-8000-000000108a01')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 2. Too long: refused, through the API as the person would write it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000108a01');
  set local role authenticated;
  do $$
  begin
    begin
      update long_video_projects set hook = repeat('x', 10001) where id = '20000000-0000-4000-8000-000000108a01';
      raise exception 'FAIL 2: a 10,001-character hook was saved';
    exception when check_violation then null;
    end;
    begin
      update teams set name = repeat('n', 201) where id = '10000000-0000-4000-8000-000000108a01';
      raise exception 'FAIL 2: a 201-character team name was saved';
    exception when check_violation then null;
    end;
    begin
      insert into project_comments (project_id, stage, author_id, body)
      values ('20000000-0000-4000-8000-000000108a01', 'ideate', '00000000-0000-4000-8000-000000108a01', repeat('c', 20001));
      raise exception 'FAIL 2: a 20,001-character comment was saved';
    exception when check_violation then null;
    end;
  end $$;
rollback;

-- 3. What the app sends goes through (its own limits are lower).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000108a01');
  set local role authenticated;
  do $$
  begin
    update long_video_projects set hook = repeat('x', 10000), notes = repeat('y', 50000), title = repeat('t', 100)
     where id = '20000000-0000-4000-8000-000000108a01';
    insert into project_comments (project_id, stage, author_id, body)
    values ('20000000-0000-4000-8000-000000108a01', 'ideate', '00000000-0000-4000-8000-000000108a01', repeat('c', 10000));
    update teams set name = repeat('n', 60) where id = '10000000-0000-4000-8000-000000108a01';
  end $$;
rollback;

-- 4. A new username looks like one; an old odd one doesn't block the rest.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000108a01');
  set local role authenticated;
  do $$
  begin
    begin
      update profiles set username = 'lia q<b>' where id = '00000000-0000-4000-8000-000000108a01';
      raise exception 'FAIL 4: a username with a space and < > was saved';
    exception when check_violation then null;
    end;
    begin
      update profiles set username = repeat('a', 21) where id = '00000000-0000-4000-8000-000000108a01';
      raise exception 'FAIL 4: a 21-character username was saved';
    exception when check_violation then null;
    end;
    update profiles set username = 'Lia_108' where id = '00000000-0000-4000-8000-000000108a01';
  end $$;
  reset role;
  -- An old username from before the rule (written by the database itself).
  alter table profiles disable trigger profiles_check_username;
  update profiles set username = 'old name 108' where id = '00000000-0000-4000-8000-000000108a01';
  alter table profiles enable trigger profiles_check_username;
  select pg_temp.as_user('00000000-0000-4000-8000-000000108a01');
  set local role authenticated;
  do $$
  begin
    update profiles set username = 'old name 108', full_name = 'Lia Limits' where id = '00000000-0000-4000-8000-000000108a01';
    if (select full_name from profiles where id = '00000000-0000-4000-8000-000000108a01') <> 'Lia Limits' then
      raise exception 'FAIL 4: an old username blocked saving the name';
    end if;
  end $$;
rollback;

-- 5. Nothing already saved was touched: the limits are NOT VALID (new writes only).
do $$
begin
  if exists (select 1 from pg_constraint where conname like '%\_limit' escape '\' and conrelid::regclass::text in ('long_video_projects', 'teams', 'profiles', 'project_comments') and convalidated) then
    raise exception 'FAIL 5: a limit was checked against what''s already saved (it should be NOT VALID)';
  end if;
  if (select count(*) from pg_constraint where conname like '%\_limit' escape '\' and connamespace = 'public'::regnamespace) < 35 then
    raise exception 'FAIL 5: limits missing (% found)', (select count(*) from pg_constraint where conname like '%\_limit' escape '\' and connamespace = 'public'::regnamespace);
  end if;
end $$;

select 'form-limits checks passed' as ok;
