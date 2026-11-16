-- Checks for 0131 (To Do, 1.53.0): lists, steps and My Day's team tasks are each person's own; a to-do goes only into
-- your own list; deleting a list takes its to-dos; the limits hold; a moved reminder can go out again; the timer wakes
-- the app for a reminder that's due (and not for an old one, or one already sent). Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: A and B, A on team T with one task of their own and B with one of theirs.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000131a1', 'a-todo@example.com'),
  ('00000000-0000-4000-8000-0000000131a2', 'b-todo@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000131a1', 'a-todo@example.com'),
  ('00000000-0000-4000-8000-0000000131a2', 'b-todo@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000131a1', 'Team To Do', 'todo-t', '00000000-0000-4000-8000-0000000131a1')
on conflict do nothing;
insert into tasks (id, team_id, user_id, kind, item_id, stage, state, due_date) values
  ('60000000-0000-4000-8000-0000000131a1', '10000000-0000-4000-8000-0000000131a1', '00000000-0000-4000-8000-0000000131a1', 'short', '20000000-0000-4000-8000-0000000131a1', 'editing', 'active', current_date),
  ('60000000-0000-4000-8000-0000000131a2', '10000000-0000-4000-8000-0000000131a1', '00000000-0000-4000-8000-0000000131a2', 'short', '20000000-0000-4000-8000-0000000131a1', 'review', 'waiting', current_date)
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. A makes a list, a to-do in it with a step, puts their own team task in My Day, and saves the page's settings.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a1');
  set local role authenticated;
  insert into todo_lists (id, name, emoji, color) values ('70000000-0000-4000-8000-0000000131a1', 'Shoot ideas', '🎬', 'orange');
  insert into todos (id, title, list_id, important, my_day, repeat, categories, remind_at)
  values ('80000000-0000-4000-8000-0000000131a1', 'Scout the market', '70000000-0000-4000-8000-0000000131a1', true, current_date,
          '{"every": 1, "unit": "week", "days": [1, 3]}', array['Filming', 'Errands'], now() + interval '2 hours');
  insert into todos (id, title) values ('80000000-0000-4000-8000-0000000131a2', 'In Tasks');
  insert into todo_steps (todo_id, title) values ('80000000-0000-4000-8000-0000000131a1', 'Charge the batteries');
  insert into todo_day_tasks (task_id, day) values ('60000000-0000-4000-8000-0000000131a1', current_date);
  update profiles set todo_prefs = '{"sorts": {"myday": {"by": "due", "dir": "asc"}}}' where id = '00000000-0000-4000-8000-0000000131a1';
  do $$ begin
    if (select count(*) from todo_lists) <> 1 or (select count(*) from todo_steps) <> 1 or (select count(*) from todo_day_tasks) <> 1 then
      raise exception 'FAIL 1: A sees their own list, step and My Day task';
    end if;
    if (select user_id from todos where id = '80000000-0000-4000-8000-0000000131a1') <> '00000000-0000-4000-8000-0000000131a1' then
      raise exception 'FAIL 1: a new to-do is the person''s own';
    end if;
  end $$;
commit;

-- 2. B sees none of it, can't put a to-do into A's list or a step on A's to-do, or B's own task in A's name.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a2');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from todo_lists) or exists (select 1 from todos) or exists (select 1 from todo_steps) or exists (select 1 from todo_day_tasks) then
      raise exception 'FAIL 2: B sees A''s lists, to-dos, steps or My Day';
    end if;
    begin
      insert into todos (title, list_id) values ('Sneaky', '70000000-0000-4000-8000-0000000131a1');
      raise exception 'FAIL 2: B put a to-do into A''s list';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into todo_steps (todo_id, title) values ('80000000-0000-4000-8000-0000000131a1', 'Sneaky step');
      raise exception 'FAIL 2: B added a step to A''s to-do';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into todo_day_tasks (task_id, day) values ('60000000-0000-4000-8000-0000000131a1', current_date);
      raise exception 'FAIL 2: B put A''s team task in their My Day';
    exception when insufficient_privilege then null;
    end;
    -- Changing A's to-dos, lists or steps reaches nothing.
    update todos set title = 'Taken' where id = '80000000-0000-4000-8000-0000000131a1';
    update todo_lists set name = 'Taken' where id = '70000000-0000-4000-8000-0000000131a1';
    delete from todo_steps;
  end $$;
  -- B's own task in their own My Day is fine.
  insert into todo_day_tasks (task_id, day) values ('60000000-0000-4000-8000-0000000131a2', current_date);
commit;
do $$ begin
  if (select title from todos where id = '80000000-0000-4000-8000-0000000131a1') <> 'Scout the market'
     or (select name from todo_lists where id = '70000000-0000-4000-8000-0000000131a1') <> 'Shoot ideas'
     or (select count(*) from todo_steps where todo_id = '80000000-0000-4000-8000-0000000131a1') <> 1 then
    raise exception 'FAIL 2: B changed A''s things';
  end if;
end $$;

-- 3. A moving a to-do into a list that isn't theirs is refused too (B makes one first).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a2');
  set local role authenticated;
  insert into todo_lists (id, name) values ('70000000-0000-4000-8000-0000000131a2', 'B''s list');
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a1');
  set local role authenticated;
  do $$ begin
    begin
      update todos set list_id = '70000000-0000-4000-8000-0000000131a2' where id = '80000000-0000-4000-8000-0000000131a2';
      raise exception 'FAIL 3: A moved a to-do into B''s list';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 4. The limits: a list's name, its colour, how a to-do repeats, its categories, a step's title, the page's settings.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a1');
  set local role authenticated;
  do $$ begin
    begin insert into todo_lists (name) values (repeat('x', 101)); raise exception 'FAIL 4: a 101-character list name'; exception when check_violation then null; end;
    begin insert into todo_lists (name) values ('   '); raise exception 'FAIL 4: a list with no name'; exception when check_violation then null; end;
    begin insert into todo_lists (name, color) values ('Pink?', '#ff00ff'); raise exception 'FAIL 4: a colour that isn''t one of the palette''s'; exception when check_violation then null; end;
    begin insert into todos (title, repeat) values ('Bad repeat', '[1, 2]'); raise exception 'FAIL 4: a repeat that isn''t an object'; exception when check_violation then null; end;
    begin insert into todos (title, repeat) values ('Huge repeat', jsonb_build_object('x', repeat('y', 400))); raise exception 'FAIL 4: a huge repeat'; exception when check_violation then null; end;
    begin insert into todos (title, categories) values ('Many', array['a','b','c','d','e','f','g','h','i']); raise exception 'FAIL 4: nine categories'; exception when check_violation then null; end;
    begin insert into todo_steps (todo_id, title) values ('80000000-0000-4000-8000-0000000131a1', ''); raise exception 'FAIL 4: an empty step'; exception when check_violation then null; end;
    begin
      update profiles set todo_prefs = '"just text"' where id = '00000000-0000-4000-8000-0000000131a1';
      raise exception 'FAIL 4: settings that aren''t an object';
    exception when check_violation then null;
    end;
  end $$;
commit;

-- 5. Reminders: due in the last day and not sent → the timer wakes the app; sent → quiet; moved → it can go out again;
--    finished → quiet; one from two days ago that never went out → quiet.
do $$ begin
  if todo_reminders_due() then raise exception 'FAIL 5: nothing is due yet'; end if;
end $$;
update todos set remind_at = now() - interval '1 minute' where id = '80000000-0000-4000-8000-0000000131a1';
do $$ begin
  if not todo_reminders_due() then raise exception 'FAIL 5: a reminder due a minute ago wakes the app'; end if;
  if position('todo_reminders_due()' in pg_get_functiondef('run_posting_tick()'::regprocedure)) = 0 then
    raise exception 'FAIL 5: the every-minute timer asks about to-do reminders';
  end if;
end $$;
update todos set reminded_at = now() where id = '80000000-0000-4000-8000-0000000131a1';
do $$ begin
  if todo_reminders_due() then raise exception 'FAIL 5: a sent reminder stays quiet'; end if;
end $$;
update todos set remind_at = now() - interval '30 seconds' where id = '80000000-0000-4000-8000-0000000131a1';
do $$ begin
  if (select reminded_at from todos where id = '80000000-0000-4000-8000-0000000131a1') is not null or not todo_reminders_due() then
    raise exception 'FAIL 5: a moved reminder can go out again';
  end if;
end $$;
update todos set done_at = now() where id = '80000000-0000-4000-8000-0000000131a1';
do $$ begin
  if todo_reminders_due() then raise exception 'FAIL 5: a finished to-do sends no reminder'; end if;
end $$;
update todos set done_at = null, remind_at = now() - interval '2 days' where id = '80000000-0000-4000-8000-0000000131a1';
do $$ begin
  if todo_reminders_due() then raise exception 'FAIL 5: a reminder from two days ago that never went out stays quiet'; end if;
  if (select updated_at from todos where id = '80000000-0000-4000-8000-0000000131a1') < now() - interval '1 minute' then
    raise exception 'FAIL 5: updated_at follows the changes';
  end if;
end $$;
-- Nobody signed in, or signed in, asks the timer's question themselves.
do $$ begin
  if has_function_privilege('authenticated', 'public.todo_reminders_due()', 'execute') or has_function_privilege('anon', 'public.todo_reminders_due()', 'execute') then
    raise exception 'FAIL 5: todo_reminders_due is the database''s own';
  end if;
end $$;

-- 6. Deleting a list takes its to-dos and their steps; the task in My Day goes when the task does.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000131a1');
  set local role authenticated;
  delete from todo_lists where id = '70000000-0000-4000-8000-0000000131a1';
  do $$ begin
    if exists (select 1 from todos where id = '80000000-0000-4000-8000-0000000131a1') or exists (select 1 from todo_steps) then
      raise exception 'FAIL 6: the list''s to-dos and steps go with it';
    end if;
    if not exists (select 1 from todos where id = '80000000-0000-4000-8000-0000000131a2') then
      raise exception 'FAIL 6: a to-do in Tasks stays';
    end if;
  end $$;
commit;
delete from tasks where id = '60000000-0000-4000-8000-0000000131a1';
do $$ begin
  if exists (select 1 from todo_day_tasks where task_id = '60000000-0000-4000-8000-0000000131a1') then
    raise exception 'FAIL 6: a task that''s gone leaves My Day';
  end if;
end $$;

-- Clean up (the next test files start from their own people).
delete from todo_day_tasks where user_id in ('00000000-0000-4000-8000-0000000131a1', '00000000-0000-4000-8000-0000000131a2');
delete from todos where user_id in ('00000000-0000-4000-8000-0000000131a1', '00000000-0000-4000-8000-0000000131a2');
delete from todo_lists where user_id in ('00000000-0000-4000-8000-0000000131a1', '00000000-0000-4000-8000-0000000131a2');
delete from tasks where team_id = '10000000-0000-4000-8000-0000000131a1';
