-- 0131 (1.53.0): To Do, the way Microsoft To Do works. The owner (Nov 16 2026): "i want a to do list that is the same
-- functionality as microsoft to do, i want a separate page for it ... The assigned to me tab will be the actual tasks
-- that we get in the tasks widget."
--
-- Still personal, like the widget's list (0053): only you see yours.
--   * todo_lists: your own lists (name, emoji, colour, order, how it's sorted, whether finished ones show). A to-do
--     with no list is in "Tasks", everyone's first list.
--   * todos (0053) gains its list, the star (important), my_day (the day you put it in My Day; it leaves My Day the
--     next day), a reminder (remind_at; reminded_at once it went out), how it repeats, categories and updated_at.
--   * todo_steps: a to-do's steps.
--   * todo_day_tasks: team tasks (Assigned to me: the My tasks widget's own) you put in My Day, for that day.
--   * profiles.todo_prefs: how the smart lists are sorted, and the page's few settings.
-- Reminders: the every-minute timer (run_posting_tick, 0057) also wakes the app when a reminder is due; the app sends
-- it (the bell and push) and stamps reminded_at. Additive and safe to run twice.

-- ---------------------------------------------------------------------------
-- Your lists
-- ---------------------------------------------------------------------------
create table if not exists todo_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  emoji text,
  color text not null default 'blue',
  position double precision not null default 0,
  sort_by text,
  sort_dir text not null default 'asc',
  hide_done boolean not null default false,
  created_at timestamptz not null default now(),
  constraint todo_lists_name_ok check (char_length(btrim(name)) between 1 and 100),
  constraint todo_lists_emoji_ok check (emoji is null or char_length(emoji) between 1 and 16),
  constraint todo_lists_color_ok check (color in ('blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet', 'slate')),
  constraint todo_lists_sort_by_ok check (sort_by is null or sort_by in ('importance', 'due', 'alpha', 'created', 'myday')),
  constraint todo_lists_sort_dir_ok check (sort_dir in ('asc', 'desc'))
);
create index if not exists todo_lists_user_idx on todo_lists (user_id, position);
alter table todo_lists enable row level security;
drop policy if exists "your own lists" on todo_lists;
create policy "your own lists" on todo_lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A to-do app, not a dumping ground: 100 lists each.
create or replace function todo_lists_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from todo_lists where user_id = new.user_id) >= 100 then
    raise exception 'You have 100 lists already.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function todo_lists_limit() from public, anon, authenticated;
drop trigger if exists todo_lists_limit on todo_lists;
create trigger todo_lists_limit before insert on todo_lists for each row execute procedure todo_lists_limit();

-- ---------------------------------------------------------------------------
-- The to-dos (0053) gain what Microsoft To Do's have
-- ---------------------------------------------------------------------------
alter table todos add column if not exists list_id uuid references todo_lists(id) on delete cascade;
alter table todos add column if not exists important boolean not null default false;
alter table todos add column if not exists my_day date;
alter table todos add column if not exists remind_at timestamptz;
alter table todos add column if not exists reminded_at timestamptz;
alter table todos add column if not exists repeat jsonb;
alter table todos add column if not exists categories text[] not null default '{}';
alter table todos add column if not exists updated_at timestamptz not null default now();

-- How it repeats: {"every": 1-999, "unit": "day" | "week" | "month" | "year", "days": [0-6]} (the app checks the
-- shape; here, its size). Categories: up to 8, a few words each.
alter table todos drop constraint if exists todos_repeat_ok;
alter table todos add constraint todos_repeat_ok check (repeat is null or (jsonb_typeof(repeat) = 'object' and pg_column_size(repeat) <= 300));
alter table todos drop constraint if exists todos_categories_ok;
alter table todos add constraint todos_categories_ok check (cardinality(categories) <= 8 and char_length(array_to_string(categories, '|')) <= 300);

create index if not exists todos_list_idx on todos (list_id) where list_id is not null;
create index if not exists todos_remind_idx on todos (remind_at) where remind_at is not null and reminded_at is null and done_at is null;

-- Into your own lists only.
drop policy if exists "your own todos" on todos;
create policy "your own todos" on todos for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (list_id is null or exists (select 1 from todo_lists l where l.id = list_id and l.user_id = (select auth.uid()))));

-- 20,000 each (finished ones count).
create or replace function todos_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from todos where user_id = new.user_id) >= 20000 then
    raise exception 'You have 20,000 to-dos already. Delete some finished ones first.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function todos_limit() from public, anon, authenticated;
drop trigger if exists todos_limit on todos;
create trigger todos_limit before insert on todos for each row execute procedure todos_limit();

-- When it last changed; a reminder moved (or finished and opened again) can go out again.
create or replace function todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;
revoke all on function todos_touch() from public, anon, authenticated;
drop trigger if exists todos_touch on todos;
create trigger todos_touch before update on todos for each row execute procedure todos_touch();

-- ---------------------------------------------------------------------------
-- Steps
-- ---------------------------------------------------------------------------
create table if not exists todo_steps (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references todos(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null,
  done_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  constraint todo_steps_title_ok check (char_length(btrim(title)) between 1 and 300)
);
create index if not exists todo_steps_todo_idx on todo_steps (todo_id, position);
create index if not exists todo_steps_user_idx on todo_steps (user_id);
alter table todo_steps enable row level security;
drop policy if exists "your own steps" on todo_steps;
create policy "your own steps" on todo_steps for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from todos t where t.id = todo_id and t.user_id = (select auth.uid())));

-- 100 steps a to-do.
create or replace function todo_steps_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from todo_steps where todo_id = new.todo_id) >= 100 then
    raise exception 'A to-do has 100 steps at most.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function todo_steps_limit() from public, anon, authenticated;
drop trigger if exists todo_steps_limit on todo_steps;
create trigger todo_steps_limit before insert on todo_steps for each row execute procedure todo_steps_limit();

-- ---------------------------------------------------------------------------
-- Team tasks in My Day (your own tasks only, 0053)
-- ---------------------------------------------------------------------------
create table if not exists todo_day_tasks (
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
create index if not exists todo_day_tasks_task_idx on todo_day_tasks (task_id);
alter table todo_day_tasks enable row level security;
drop policy if exists "your own day" on todo_day_tasks;
create policy "your own day" on todo_day_tasks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from tasks k where k.id = task_id and k.user_id = (select auth.uid())));

-- Two-step sign-in (0125) holds on the new tables too: nothing until the second step.
do $$
declare
  t text;
begin
  foreach t in array array['todo_lists', 'todo_steps', 'todo_day_tasks'] loop
    execute format('drop policy if exists "two-step sign-in" on public.%I', t);
    execute format(
      'create policy "two-step sign-in" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The page's own settings
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists todo_prefs jsonb;
alter table profiles drop constraint if exists profiles_todo_prefs_ok;
alter table profiles add constraint profiles_todo_prefs_ok check (todo_prefs is null or (jsonb_typeof(todo_prefs) = 'object' and pg_column_size(todo_prefs) <= 4000));
grant update (todo_prefs) on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Reminders: the every-minute timer also wakes the app for one that's due
-- ---------------------------------------------------------------------------
-- Due in the last day and not sent yet (an older one that never went out, say while the timer was off, stays quiet).
create or replace function todo_reminders_due()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from todos
     where remind_at is not null and reminded_at is null and done_at is null
       and remind_at <= now() and remind_at > now() - interval '1 day'
  );
$$;
revoke all on function todo_reminders_due() from public, anon, authenticated;

-- As in 0057, plus to-do reminders.
create or replace function run_posting_tick()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from social_posts
     where status in ('scheduled', 'uploading', 'processing', 'waiting') and next_attempt_at <= now()
  ) and not meeting_reminders_due() and not todo_reminders_due() then
    return;
  end if;
  perform posting_call('{}'::jsonb);
end;
$$;
revoke all on function run_posting_tick() from public, anon, authenticated;
