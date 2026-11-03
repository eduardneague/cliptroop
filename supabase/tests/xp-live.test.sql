-- Checks for 0101: my_progress() (your XP and XP bar colour, yours only) and
-- tasks in the realtime publication. Run by scripts/db/test-from-scratch.sh;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000101a1', 'x-live@example.com'),
  ('00000000-0000-4000-8000-0000000101a2', 'y-live@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000101a1', 'x-live@example.com'),
  ('00000000-0000-4000-8000-0000000101a2', 'y-live@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000101a1', 'Live', 'xp-live', '00000000-0000-4000-8000-0000000101a1')
on conflict do nothing;
-- X: a long video's edit on time (90 + 23) and a short's script (30): 143 XP.
insert into tasks (team_id, user_id, kind, item_id, stage, state, due_date, activated_at, completed_at) values
  ('10000000-0000-4000-8000-0000000101a1', '00000000-0000-4000-8000-0000000101a1', 'long', '20000000-0000-4000-8000-0000000101a1', 'edit', 'done', current_date + 3, now() - interval '2 days', now() - interval '1 day'),
  ('10000000-0000-4000-8000-0000000101a1', '00000000-0000-4000-8000-0000000101a1', 'short', '20000000-0000-4000-8000-0000000101a2', 'script', 'done', null, now() - interval '2 days', now());

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Yours: your XP, and the level's colour for the bar until you pick one.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000101a1');
  set local role authenticated;
  do $$
  declare
    j jsonb := my_progress();
  begin
    if (j->>'xp')::int <> 143 or j->>'bar' <> 'level' then
      raise exception '1: my_progress should be 143 XP and the level''s colour, is %', j;
    end if;
  end;
  $$;
  insert into profile_pages (bar_color) values ('#30a46c');
  do $$
  begin
    if my_progress()->>'bar' <> '#30a46c' then
      raise exception '1: the bar should follow your choice, is %', my_progress();
    end if;
  end;
  $$;
commit;

-- 2. Someone else asking gets their own (none here), never yours; signed out: nothing.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000101a2');
  set local role authenticated;
  do $$
  begin
    if (my_progress()->>'xp')::int <> 0 then
      raise exception '2: Y has no XP, got %', my_progress();
    end if;
  end;
  $$;
commit;
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  if my_progress() is not null then
    raise exception '2: signed out should get nothing';
  end if;
end;
$$;

-- 3. Tasks are in the realtime publication (when there is one).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    raise exception '3: tasks should be in supabase_realtime';
  end if;
end;
$$;
