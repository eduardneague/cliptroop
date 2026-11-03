-- ============================================================================
-- 0117: who opens the media kit is a master's choice, not a role (1.40.0).
--
-- The owner: "for the media kit, i want to be able to do like from revenue,
-- as the master, i can set people who can see and create the media kit, i
-- dont want it through a role, i want it as a separate thing." So, as with
-- revenue access (0058):
--
--   * media_kit_access (team, person, who gave it and when): Masters give it
--     and take it away; the person and Masters see it. Only someone active
--     on the team can be given it, and it counts only while they are;
--     leaving the team takes it away.
--   * media_kit_team_ids() (0116) now: the teams where you're an active
--     Master, or have media kit access. 0116's rules (the setup and the
--     cover photo) go through it, so nothing else changes.
--   * The Partnerships role (0115) goes from the app: whoever has it gets
--     media kit access instead (media_kit_role_to_access(), run once here),
--     and it's taken off members, pending invites and role colours. The value
--     stays in role_type (PostgreSQL can't drop one) but nothing uses it.
--
-- supabase/tests/media-kit.test.sql checks it. Additive; safe to run twice.
-- Run after 0115 and 0116. Staging first, then production.
-- ============================================================================

create table if not exists media_kit_access (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists media_kit_access_user_idx on media_kit_access (user_id);
create index if not exists media_kit_access_granted_by_idx on media_kit_access (granted_by);

alter table media_kit_access enable row level security;
revoke all on media_kit_access from anon, authenticated;
grant select, insert, delete on media_kit_access to authenticated;

drop policy if exists "masters and the person see media kit access" on media_kit_access;
create policy "masters and the person see media kit access" on media_kit_access for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select my_master_team_ids()));
drop policy if exists "masters give media kit access" on media_kit_access;
create policy "masters give media kit access" on media_kit_access for insert to authenticated
  with check (
    team_id in (select my_master_team_ids())
    and exists (select 1 from team_members tm where tm.team_id = media_kit_access.team_id and tm.user_id = media_kit_access.user_id and tm.status = 'active')
  );
drop policy if exists "masters take media kit access away" on media_kit_access;
create policy "masters take media kit access away" on media_kit_access for delete to authenticated
  using (team_id in (select my_master_team_ids()));

-- Who gave it and when: the database's, whatever the app sends.
create or replace function media_kit_access_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.granted_at := now();
  return new;
end;
$$;
revoke all on function media_kit_access_before_insert() from public, anon, authenticated;
drop trigger if exists media_kit_access_before_insert on media_kit_access;
create trigger media_kit_access_before_insert before insert on media_kit_access
  for each row execute procedure media_kit_access_before_insert();

-- Leaving the team (or being removed) takes it away: coming back later doesn't bring it back by itself.
create or replace function media_kit_access_on_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from media_kit_access where team_id = old.team_id and user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function media_kit_access_on_leave() from public, anon, authenticated;
drop trigger if exists media_kit_access_on_leave on team_members;
create trigger media_kit_access_on_leave after delete on team_members
  for each row execute function media_kit_access_on_leave();

-- The teams whose media kit you open: an active Master, or given access while active.
create or replace function media_kit_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
    from team_members tm
    join member_roles mr on mr.team_member_id = tm.id
   where tm.user_id = auth.uid() and tm.status = 'active' and mr.role = 'master'
  union
  select ma.team_id
    from media_kit_access ma
    join team_members tm on tm.team_id = ma.team_id and tm.user_id = ma.user_id and tm.status = 'active'
   where ma.user_id = auth.uid()
$$;
revoke all on function media_kit_team_ids() from public, anon;
grant execute on function media_kit_team_ids() to authenticated, service_role;

-- The Partnerships role becomes media kit access (run here once; safe to run again).
create or replace function media_kit_role_to_access()
returns integer
language plpgsql
set search_path = public
as $$
declare
  moved integer;
begin
  insert into media_kit_access (team_id, user_id)
  select tm.team_id, tm.user_id
    from member_roles mr
    join team_members tm on tm.id = mr.team_member_id
   where mr.role = 'partnerships'
  on conflict (team_id, user_id) do nothing;
  get diagnostics moved = row_count;
  delete from member_roles where role = 'partnerships';
  update team_invites set proposed_roles = array_remove(proposed_roles, 'partnerships'::role_type)
   where 'partnerships'::role_type = any(proposed_roles);
  delete from role_colors where role = 'partnerships';
  return moved;
end;
$$;
revoke all on function media_kit_role_to_access() from public, anon, authenticated;
select media_kit_role_to_access();
