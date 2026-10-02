-- ============================================================================
-- 0057: meetings
--
--   * meetings: planned team meetings (usually on Discord, ~2 a month).
--     Masters and schedulers plan, edit and cancel them; everyone on the team
--     sees them. Agenda and notes are plain text (organizers edit them).
--   * meeting_attendees: who's invited and their answer (going / maybe /
--     can't). You change only your own answer.
--   * meeting_actions: action items from a meeting, optionally owned by
--     someone with a due date. Anyone on the team adds them and ticks them
--     off; the author or an organizer removes them.
--   * Reminders 3 days, 1 day and 1 hour before (in the app + email): the
--     every-minute timer (0040/0043) now also wakes the app when one is due;
--     reminded_* remember which were sent. Planning a meeting closer than a
--     reminder's window skips that reminder (you were just told).
-- Run on staging, then production. Safe to run more than once.
-- ============================================================================

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 5 and 720),
  location text not null default 'Discord' check (char_length(location) <= 120),
  link text check (link is null or (char_length(link) <= 500 and link ~* '^https?://')),
  agenda text not null default '' check (char_length(agenda) <= 20000),
  notes text not null default '' check (char_length(notes) <= 50000),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminded_3d_at timestamptz,
  reminded_1d_at timestamptz,
  reminded_1h_at timestamptz
);
create index if not exists meetings_team_start_idx on meetings (team_id, starts_at);
create index if not exists meetings_due_idx on meetings (starts_at) where status = 'scheduled';

create table if not exists meeting_attendees (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  rsvp text not null default 'pending' check (rsvp in ('pending', 'yes', 'maybe', 'no')),
  responded_at timestamptz,
  primary key (meeting_id, user_id)
);
create index if not exists meeting_attendees_user_idx on meeting_attendees (user_id);

create table if not exists meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 300),
  owner_id uuid references profiles(id) on delete set null,
  due_date date,
  done_at timestamptz,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists meeting_actions_meeting_idx on meeting_actions (meeting_id, created_at);
create index if not exists meeting_actions_owner_idx on meeting_actions (owner_id) where done_at is null;

-- Masters and schedulers organize meetings.
create or replace function can_organize_meetings(p_team uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
    where tm.team_id = p_team and tm.user_id = auth.uid() and tm.status = 'active'
      and mr.role in ('master', 'publisher')
  );
$$;

-- ---- meetings ----------------------------------------------------------------
alter table meetings enable row level security;
revoke all on meetings from anon, authenticated;
grant select, insert, delete on meetings to authenticated;
grant update (title, starts_at, duration_min, location, link, agenda, notes, status) on meetings to authenticated;

drop policy if exists "team sees meetings" on meetings;
create policy "team sees meetings" on meetings for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "organizers add meetings" on meetings;
create policy "organizers add meetings" on meetings for insert to authenticated
  with check (can_organize_meetings(team_id));
drop policy if exists "organizers edit meetings" on meetings;
create policy "organizers edit meetings" on meetings for update to authenticated
  using (can_organize_meetings(team_id)) with check (can_organize_meetings(team_id));
drop policy if exists "organizers delete meetings" on meetings;
create policy "organizers delete meetings" on meetings for delete to authenticated
  using (can_organize_meetings(team_id));

-- Server-owned fields, and reminders that restart when the time changes.
create or replace function meetings_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.team_id := old.team_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    -- A reminder whose window has already started isn't sent (you were just told).
    new.reminded_3d_at := case when new.starts_at - interval '3 days' <= now() then now() end;
    new.reminded_1d_at := case when new.starts_at - interval '1 day' <= now() then now() end;
    new.reminded_1h_at := case when new.starts_at - interval '1 hour' <= now() then now() end;
  elsif tg_op = 'UPDATE' and auth.uid() is not null then
    new.reminded_3d_at := old.reminded_3d_at;
    new.reminded_1d_at := old.reminded_1d_at;
    new.reminded_1h_at := old.reminded_1h_at;
  end if;
  return new;
end;
$$;
drop trigger if exists meetings_before_write on meetings;
create trigger meetings_before_write before insert or update on meetings
  for each row execute procedure meetings_before_write();

-- ---- attendees ----------------------------------------------------------------
alter table meeting_attendees enable row level security;
revoke all on meeting_attendees from anon, authenticated;
grant select, insert, delete on meeting_attendees to authenticated;
grant update (rsvp) on meeting_attendees to authenticated;

drop policy if exists "team sees attendees" on meeting_attendees;
create policy "team sees attendees" on meeting_attendees for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "organizers invite" on meeting_attendees;
create policy "organizers invite" on meeting_attendees for insert to authenticated
  with check (
    can_organize_meetings(team_id)
    and exists (select 1 from meetings m where m.id = meeting_id and m.team_id = meeting_attendees.team_id)
    and exists (select 1 from team_members tm where tm.team_id = meeting_attendees.team_id and tm.user_id = meeting_attendees.user_id and tm.status = 'active')
  );
-- Not on the list? Anyone on the team can still say they're coming.
drop policy if exists "join yourself" on meeting_attendees;
create policy "join yourself" on meeting_attendees for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from meetings m where m.id = meeting_id and m.team_id in (select my_team_ids()))
  );
drop policy if exists "organizers uninvite" on meeting_attendees;
create policy "organizers uninvite" on meeting_attendees for delete to authenticated
  using (can_organize_meetings(team_id));
drop policy if exists "answer for yourself" on meeting_attendees;
create policy "answer for yourself" on meeting_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function meeting_attendees_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from meetings where id = new.meeting_id;
    new.rsvp := case when new.user_id = auth.uid() then coalesce(new.rsvp, 'pending') else 'pending' end;
    new.responded_at := case when new.rsvp = 'pending' then null else now() end;
  else
    new.responded_at := case when new.rsvp = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists meeting_attendees_before_write on meeting_attendees;
create trigger meeting_attendees_before_write before insert or update on meeting_attendees
  for each row execute procedure meeting_attendees_before_write();

-- ---- action items ----------------------------------------------------------------
alter table meeting_actions enable row level security;
revoke all on meeting_actions from anon, authenticated;
grant select, insert, delete on meeting_actions to authenticated;
grant update (text, owner_id, due_date, done_at) on meeting_actions to authenticated;

drop policy if exists "team sees actions" on meeting_actions;
create policy "team sees actions" on meeting_actions for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "team adds actions" on meeting_actions;
create policy "team adds actions" on meeting_actions for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "team updates actions" on meeting_actions;
create policy "team updates actions" on meeting_actions for update to authenticated
  using (team_id in (select my_team_ids())) with check (team_id in (select my_team_ids()));
drop policy if exists "author or organizer removes actions" on meeting_actions;
create policy "author or organizer removes actions" on meeting_actions for delete to authenticated
  using (created_by = auth.uid() or can_organize_meetings(team_id));

create or replace function meeting_actions_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from meetings where id = new.meeting_id;
    if new.team_id is null then
      raise exception 'Meeting not found.' using errcode = '23503';
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.meeting_id := old.meeting_id;
    new.team_id := old.team_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Done = now (the time comes from the database, not the browser).
    new.done_at := case when new.done_at is null then null when old.done_at is null then now() else old.done_at end;
  end if;
  -- The owner must be on the team.
  if new.owner_id is not null and not exists (
    select 1 from team_members tm where tm.team_id = new.team_id and tm.user_id = new.owner_id and tm.status = 'active'
  ) then
    raise exception 'That person isn''t on this team.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists meeting_actions_before_write on meeting_actions;
create trigger meeting_actions_before_write before insert or update on meeting_actions
  for each row execute procedure meeting_actions_before_write();

-- ---- realtime (the meeting page and the widget update live) ------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table meetings;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table meeting_attendees;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table meeting_actions;
  exception when others then null;
  end;
end $$;

-- ---- reminders: the timer also wakes the app when one is due ------------------------
create or replace function meeting_reminders_due()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from meetings m
     where m.status = 'scheduled' and m.starts_at > now()
       and ((m.reminded_1h_at is null and m.starts_at <= now() + interval '1 hour')
         or (m.reminded_1d_at is null and m.starts_at <= now() + interval '1 day')
         or (m.reminded_3d_at is null and m.starts_at <= now() + interval '3 days'))
  );
$$;
revoke all on function meeting_reminders_due() from public, anon, authenticated;

create or replace function run_posting_tick()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from social_posts
     where status in ('scheduled', 'uploading', 'processing', 'waiting') and next_attempt_at <= now()
  ) and not meeting_reminders_due() then
    return;
  end if;
  perform posting_call('{}'::jsonb);
end;
$$;
revoke all on function run_posting_tick() from public, anon, authenticated;
