-- ============================================================================
-- 0119: who else may delete videos is the owner's call (1.41.0).
--
-- The owner: "a danger zone where you can give permission to other team
-- members to be able to delete shorts or longs too"; only the owner gives it
-- ("Only the owner"), and "make the one at a time only or a lot with the
-- password be a thing i can set in team settings". So:
--
--   * video_delete_access (team, person, shorts, long videos, who gave it and
--     when): the team's owner gives it, changes it and takes it away; the
--     person and the owner see it. Only someone else who's active on the team
--     gets it, it counts only while they are, and leaving the team takes it
--     away. Masters delete as they always have (they don't need it).
--   * teams.delete_many_shorts / teams.delete_many_longs: may the people given
--     it delete several at once (long videos: with their password, which the
--     app's server asks for)? One at a time until the owner says otherwise.
--     Only the owner changes them (set_delete_rules); the team reads them.
--   * delete_shorts(ids): how the app deletes shorts now, for Masters and the
--     people given it alike: each short of a team where you're an active
--     Master, or were given shorts there and it's one short (or the team lets
--     several go at once). It answers the ones it deleted; the rest stay.
--     Masters' own rule on short_videos (0026) is unchanged.
--   * Long videos are deleted by the app's server, with their files (it reads
--     these same rows as the person: lib/permissions/delete-rights.ts).
--
-- supabase/tests/delete-access.test.sql checks it. Additive; safe to run twice.
-- Staging first, then production.
-- ============================================================================

create table if not exists video_delete_access (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  shorts boolean not null default false,
  longs boolean not null default false,
  granted_by uuid references profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (team_id, user_id),
  -- Nothing left to delete: the row goes instead.
  constraint video_delete_access_something check (shorts or longs)
);
create index if not exists video_delete_access_user_idx on video_delete_access (user_id);
create index if not exists video_delete_access_granted_by_idx on video_delete_access (granted_by);

alter table video_delete_access enable row level security;
revoke all on video_delete_access from anon, authenticated;
grant select, insert, delete on video_delete_access to authenticated;
-- Changing it: what may be deleted, nothing else (who gave it and when are the database's, below).
grant update (shorts, longs) on video_delete_access to authenticated;

-- The teams you own (teams.owner_id): asked once per query, like my_master_team_ids() (0109).
create or replace function my_owned_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from teams where owner_id = auth.uid();
$$;
revoke all on function my_owned_team_ids() from public, anon;
grant execute on function my_owned_team_ids() to authenticated, service_role;

drop policy if exists "the owner and the person see delete access" on video_delete_access;
create policy "the owner and the person see delete access" on video_delete_access for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select my_owned_team_ids()));
drop policy if exists "the owner gives delete access" on video_delete_access;
create policy "the owner gives delete access" on video_delete_access for insert to authenticated
  with check (
    team_id in (select my_owned_team_ids())
    and user_id <> (select auth.uid())
    and exists (
      select 1 from team_members tm
       where tm.team_id = video_delete_access.team_id and tm.user_id = video_delete_access.user_id and tm.status = 'active'
    )
  );
drop policy if exists "the owner changes delete access" on video_delete_access;
create policy "the owner changes delete access" on video_delete_access for update to authenticated
  using (team_id in (select my_owned_team_ids()))
  with check (team_id in (select my_owned_team_ids()));
drop policy if exists "the owner takes delete access away" on video_delete_access;
create policy "the owner takes delete access away" on video_delete_access for delete to authenticated
  using (team_id in (select my_owned_team_ids()));

-- Who gave it and when: the database's, whatever the app sends (a change counts as giving it again).
create or replace function video_delete_access_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.granted_at := now();
  return new;
end;
$$;
revoke all on function video_delete_access_stamp() from public, anon, authenticated;
drop trigger if exists video_delete_access_stamp on video_delete_access;
create trigger video_delete_access_stamp before insert or update on video_delete_access
  for each row execute procedure video_delete_access_stamp();

-- Leaving the team (or being removed) takes it away: coming back later doesn't bring it back by itself.
create or replace function video_delete_access_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from video_delete_access where team_id = old.team_id and user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function video_delete_access_on_leave() from public, anon, authenticated;
drop trigger if exists video_delete_access_on_leave on team_members;
create trigger video_delete_access_on_leave after delete on team_members
  for each row execute function video_delete_access_on_leave();

-- Becoming the owner (a transfer): the new owner needs nothing given, so theirs goes.
create or replace function video_delete_access_new_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    delete from video_delete_access where team_id = new.id and user_id = new.owner_id;
  end if;
  return null;
end;
$$;
revoke all on function video_delete_access_new_owner() from public, anon, authenticated;
drop trigger if exists video_delete_access_new_owner on teams;
create trigger video_delete_access_new_owner after update of owner_id on teams
  for each row execute function video_delete_access_new_owner();

-- Several at once, for the people given it (Masters are never limited by these).
alter table teams add column if not exists delete_many_shorts boolean not null default false;
alter table teams add column if not exists delete_many_longs boolean not null default false;
-- (No column grant: only set_delete_rules changes them, for the owner.)

create or replace function set_delete_rules(p_team_id uuid, p_many_shorts boolean, p_many_longs boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from teams where id = p_team_id and owner_id = auth.uid()) then
    raise exception 'Only the team''s owner decides who deletes what.' using errcode = '42501';
  end if;
  update teams
     set delete_many_shorts = coalesce(p_many_shorts, delete_many_shorts),
         delete_many_longs = coalesce(p_many_longs, delete_many_longs)
   where id = p_team_id;
end;
$$;
revoke all on function set_delete_rules(uuid, boolean, boolean) from public, anon;
grant execute on function set_delete_rules(uuid, boolean, boolean) to authenticated;

-- Shorts, one or several: the ones you may delete go (see above); the ids of those that went come back.
create or replace function delete_shorts(p_ids uuid[])
returns table (short_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select count(distinct x) into n from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null;
  if n = 0 then
    return;
  end if;
  if n > 200 then
    raise exception 'Delete at most 200 shorts at once.' using errcode = '22023';
  end if;
  return query
    with gone as (
      delete from short_videos s
       where s.id = any (p_ids)
         and (
           exists (
             select 1 from team_members tm join member_roles mr on mr.team_member_id = tm.id
              where tm.team_id = s.team_id and tm.user_id = me and tm.status = 'active' and mr.role = 'master'
           )
           or (
             exists (
               select 1 from video_delete_access a
                 join team_members tm on tm.team_id = a.team_id and tm.user_id = a.user_id and tm.status = 'active'
                where a.team_id = s.team_id and a.user_id = me and a.shorts
             )
             and (n = 1 or exists (select 1 from teams t where t.id = s.team_id and t.delete_many_shorts))
           )
         )
      returning s.id
    )
    select gone.id from gone;
end;
$$;
revoke all on function delete_shorts(uuid[]) from public, anon;
grant execute on function delete_shorts(uuid[]) to authenticated;
