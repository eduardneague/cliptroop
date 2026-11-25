-- ============================================================================
-- 0135: Affiliates (1.56.0).
--
-- The owner (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add the name, link
-- the video of the product that we did, either long or short, the product link, the code, percentage and a way to
-- add credentials and a link to the affiliate platform for each of these. the credentials should only be seen by the
-- master or by who i choose that can see them from the team, come up with great security things".
--
--   * affiliates: the team's affiliate deals (name, product link, code, percentage, status, the long video and/or
--     the Short about the product, the affiliate platform's link, notes). Everyone active on the team reads them;
--     Masters and the people they choose (affiliate_access) add, change and delete them. A linked video is always
--     one of the team's own; an affiliate never moves to another team; who and when are the database's.
--   * affiliate_access: whom a Master lets in, as media_kit_access (0117). Only someone active on the team; it counts
--     only while they are, and leaving the team takes it away.
--   * affiliate_logins: each affiliate's login, sealed by the app (AES-256-GCM with a key only the server has, bound
--     to its team and affiliate) before it gets here. Nobody reads or writes this table directly, not even the
--     people let in: only through affiliate_login_open() and affiliate_login_save(), which check who's asking.
--   * affiliate_login_events: every look at a login (shown, or a part of it copied), every change and clear, a
--     deleted affiliate that had one, and who gave or took away access. Masters read it; only the database writes it.
--     Looking is limited to 60 times in 10 minutes a person.
--   * affiliates_ready(): App setup's check.
--
-- supabase/tests/affiliates.test.sql checks it. Additive; safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who's let in (besides Masters)
-- ---------------------------------------------------------------------------
create table if not exists public.affiliate_access (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists affiliate_access_user_idx on public.affiliate_access (user_id);
create index if not exists affiliate_access_granted_by_idx on public.affiliate_access (granted_by);

-- The teams whose affiliates you manage and whose logins you see: an active Master, or let in while active.
create or replace function public.affiliate_team_ids()
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
  select aa.team_id
    from affiliate_access aa
    join team_members tm on tm.team_id = aa.team_id and tm.user_id = aa.user_id and tm.status = 'active'
   where aa.user_id = auth.uid()
$$;
revoke all on function public.affiliate_team_ids() from public, anon;
grant execute on function public.affiliate_team_ids() to authenticated, service_role;

alter table public.affiliate_access enable row level security;
revoke all on public.affiliate_access from anon, authenticated;
grant select, insert, delete on public.affiliate_access to authenticated;

drop policy if exists "masters and the person see affiliate access" on public.affiliate_access;
create policy "masters and the person see affiliate access" on public.affiliate_access for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select public.my_master_team_ids()));
drop policy if exists "masters give affiliate access" on public.affiliate_access;
create policy "masters give affiliate access" on public.affiliate_access for insert to authenticated
  with check (
    team_id in (select public.my_master_team_ids())
    and exists (select 1 from team_members tm where tm.team_id = affiliate_access.team_id and tm.user_id = affiliate_access.user_id and tm.status = 'active')
  );
drop policy if exists "masters take affiliate access away" on public.affiliate_access;
create policy "masters take affiliate access away" on public.affiliate_access for delete to authenticated
  using (team_id in (select public.my_master_team_ids()));

-- Who gave it and when: the database's, whatever the app sends.
create or replace function public.affiliate_access_before_insert()
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
revoke all on function public.affiliate_access_before_insert() from public, anon, authenticated;
drop trigger if exists affiliate_access_before_insert on public.affiliate_access;
create trigger affiliate_access_before_insert before insert on public.affiliate_access
  for each row execute procedure public.affiliate_access_before_insert();

-- Leaving the team (or being removed) takes it away: coming back later doesn't bring it back by itself.
create or replace function public.affiliate_access_on_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from affiliate_access where team_id = old.team_id and user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function public.affiliate_access_on_leave() from public, anon, authenticated;
drop trigger if exists affiliate_access_on_leave on public.team_members;
create trigger affiliate_access_on_leave after delete on public.team_members
  for each row execute function public.affiliate_access_on_leave();

-- ---------------------------------------------------------------------------
-- 2. The affiliates
-- ---------------------------------------------------------------------------
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  product_url text,
  code text,
  percentage text,
  status text not null default 'active',
  project_id uuid references public.long_video_projects(id) on delete set null,
  short_id uuid references public.short_videos(id) on delete set null,
  platform_url text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliates_name_ok check (char_length(btrim(name)) between 1 and 120),
  constraint affiliates_product_url_ok check (product_url is null or (char_length(product_url) <= 2000 and product_url ~* '^https?://[^[:space:]]+$')),
  constraint affiliates_code_ok check (code is null or char_length(code) between 1 and 100),
  constraint affiliates_percentage_ok check (percentage is null or char_length(percentage) between 1 and 60),
  constraint affiliates_status_ok check (status in ('active', 'paused', 'ended')),
  constraint affiliates_platform_url_ok check (platform_url is null or (char_length(platform_url) <= 2000 and platform_url ~* '^https?://[^[:space:]]+$')),
  constraint affiliates_notes_ok check (notes is null or char_length(notes) <= 2000)
);
create index if not exists affiliates_team_idx on public.affiliates (team_id, created_at desc);
create index if not exists affiliates_project_idx on public.affiliates (project_id) where project_id is not null;
create index if not exists affiliates_short_idx on public.affiliates (short_id) where short_id is not null;
create index if not exists affiliates_created_by_idx on public.affiliates (created_by);
create index if not exists affiliates_updated_by_idx on public.affiliates (updated_by);

create or replace function public.affiliates_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- A linked video deleted (its link set to null by the database): nothing else changes, nobody "edited" it.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  new.name := btrim(new.name);
  new.product_url := nullif(btrim(coalesce(new.product_url, '')), '');
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.percentage := nullif(btrim(coalesce(new.percentage, '')), '');
  new.platform_url := nullif(btrim(coalesce(new.platform_url, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if tg_op = 'INSERT' then
    if (select count(*) from affiliates where team_id = new.team_id) >= 1000 then
      raise exception 'A team can keep 1,000 affiliates.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id then
      raise exception 'An affiliate stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  -- A linked video is one of the team's own.
  if new.project_id is not null and not exists (select 1 from long_video_projects p where p.id = new.project_id and p.team_id = new.team_id) then
    raise exception 'That long video isn''t on this team.' using errcode = '42501';
  end if;
  if new.short_id is not null and not exists (select 1 from short_videos s where s.id = new.short_id and s.team_id = new.team_id) then
    raise exception 'That short isn''t on this team.' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.affiliates_write() from public, anon, authenticated;
drop trigger if exists affiliates_write on public.affiliates;
create trigger affiliates_write before insert or update on public.affiliates
  for each row execute function public.affiliates_write();

alter table public.affiliates enable row level security;
revoke all on public.affiliates from anon, authenticated;
grant select, insert, update, delete on public.affiliates to authenticated;

drop policy if exists "the team reads its affiliates" on public.affiliates;
create policy "the team reads its affiliates" on public.affiliates for select to authenticated
  using (team_id in (select public.my_team_ids()));
drop policy if exists "affiliate people add affiliates" on public.affiliates;
create policy "affiliate people add affiliates" on public.affiliates for insert to authenticated
  with check (team_id in (select public.affiliate_team_ids()));
drop policy if exists "affiliate people change affiliates" on public.affiliates;
create policy "affiliate people change affiliates" on public.affiliates for update to authenticated
  using (team_id in (select public.affiliate_team_ids()))
  with check (team_id in (select public.affiliate_team_ids()));
drop policy if exists "affiliate people delete affiliates" on public.affiliates;
create policy "affiliate people delete affiliates" on public.affiliates for delete to authenticated
  using (team_id in (select public.affiliate_team_ids()));

-- ---------------------------------------------------------------------------
-- 3. The logins: sealed, and out of everyone's reach but through the functions
-- ---------------------------------------------------------------------------
create table if not exists public.affiliate_logins (
  affiliate_id uuid primary key references public.affiliates(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  sealed text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- What the app seals: "av1.<iv>.<tag>.<data>" (base64url). Never a login as typed.
  constraint affiliate_logins_sealed_ok check (char_length(sealed) <= 12000 and sealed ~ '^av1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$')
);
create index if not exists affiliate_logins_team_idx on public.affiliate_logins (team_id);
create index if not exists affiliate_logins_updated_by_idx on public.affiliate_logins (updated_by);

alter table public.affiliate_logins enable row level security;
revoke all on public.affiliate_logins from anon, authenticated;
-- (No policy and no grant for anyone signed in: affiliate_login_open() / affiliate_login_save() are the only way in.)

create table if not exists public.affiliate_login_events (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  affiliate_id uuid references public.affiliates(id) on delete set null,
  -- The affiliate's name then (it may be renamed or deleted later).
  affiliate_name text,
  user_id uuid references public.profiles(id) on delete set null,
  -- Who was given or lost access (granted / revoked).
  subject_id uuid references public.profiles(id) on delete set null,
  action text not null,
  at timestamptz not null default now(),
  constraint affiliate_login_events_action_ok check (action in ('viewed', 'copied_username', 'copied_password', 'copied_notes', 'changed', 'cleared', 'deleted', 'granted', 'revoked'))
);
create index if not exists affiliate_login_events_team_idx on public.affiliate_login_events (team_id, at desc);
create index if not exists affiliate_login_events_affiliate_idx on public.affiliate_login_events (affiliate_id);
create index if not exists affiliate_login_events_user_idx on public.affiliate_login_events (user_id, at desc);
create index if not exists affiliate_login_events_subject_idx on public.affiliate_login_events (subject_id);

alter table public.affiliate_login_events enable row level security;
revoke all on public.affiliate_login_events from anon, authenticated;
grant select on public.affiliate_login_events to authenticated;
drop policy if exists "masters read the login activity" on public.affiliate_login_events;
create policy "masters read the login activity" on public.affiliate_login_events for select to authenticated
  using (team_id in (select public.my_master_team_ids()));

-- Which of the team's affiliates have a login, and when it last changed: for the people let in (nobody else learns
-- even that much).
create or replace function public.affiliate_login_states(p_team uuid)
returns table (affiliate_id uuid, updated_at timestamptz, updated_by uuid)
language sql
stable
security definer set search_path = public
as $$
  select l.affiliate_id, l.updated_at, l.updated_by
    from affiliate_logins l
   where l.team_id = p_team
     and p_team in (select affiliate_team_ids())
$$;
revoke all on function public.affiliate_login_states(uuid) from public, anon;
grant execute on function public.affiliate_login_states(uuid) to authenticated, service_role;

-- One login, still sealed (only the server opens it), for someone let in: written down as how it was used. Null when
-- the affiliate has none. 60 in 10 minutes a person at most.
create or replace function public.affiliate_login_open(p_affiliate uuid, p_how text)
returns text
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  a_team uuid;
  a_name text;
  s text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_how is null or p_how not in ('viewed', 'copied_username', 'copied_password', 'copied_notes') then
    raise exception 'Not a way to open a login.' using errcode = '22023';
  end if;
  select a.team_id, a.name into a_team, a_name from affiliates a where a.id = p_affiliate;
  if a_team is null or not (a_team in (select affiliate_team_ids())) then
    raise exception 'Only masters and the people they choose see logins.' using errcode = '42501';
  end if;
  if (
    select count(*) from affiliate_login_events e
     where e.user_id = auth.uid()
       and e.action in ('viewed', 'copied_username', 'copied_password', 'copied_notes')
       and e.at > now() - interval '10 minutes'
  ) >= 60 then
    raise exception 'That''s a lot of logins in a few minutes. Wait a little, then try again.' using errcode = '54000', hint = 'too_many';
  end if;
  select l.sealed into s from affiliate_logins l where l.affiliate_id = p_affiliate;
  if s is null then
    return null;
  end if;
  insert into affiliate_login_events (team_id, affiliate_id, affiliate_name, user_id, action)
  values (a_team, p_affiliate, a_name, auth.uid(), p_how);
  return s;
end;
$$;
revoke all on function public.affiliate_login_open(uuid, text) from public, anon;
grant execute on function public.affiliate_login_open(uuid, text) to authenticated, service_role;

-- A login set or replaced (sealed), or cleared (null), by someone let in: written down.
create or replace function public.affiliate_login_save(p_affiliate uuid, p_sealed text)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  a_team uuid;
  a_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select a.team_id, a.name into a_team, a_name from affiliates a where a.id = p_affiliate;
  if a_team is null or not (a_team in (select affiliate_team_ids())) then
    raise exception 'Only masters and the people they choose change logins.' using errcode = '42501';
  end if;
  if p_sealed is null then
    delete from affiliate_logins where affiliate_id = p_affiliate;
    if found then
      insert into affiliate_login_events (team_id, affiliate_id, affiliate_name, user_id, action)
      values (a_team, p_affiliate, a_name, auth.uid(), 'cleared');
    end if;
    return;
  end if;
  insert into affiliate_logins (affiliate_id, team_id, sealed, updated_by, updated_at)
  values (p_affiliate, a_team, p_sealed, auth.uid(), now())
  on conflict (affiliate_id) do update set sealed = excluded.sealed, updated_by = excluded.updated_by, updated_at = now();
  insert into affiliate_login_events (team_id, affiliate_id, affiliate_name, user_id, action)
  values (a_team, p_affiliate, a_name, auth.uid(), 'changed');
end;
$$;
revoke all on function public.affiliate_login_save(uuid, text) from public, anon;
grant execute on function public.affiliate_login_save(uuid, text) to authenticated, service_role;

-- An affiliate deleted with its login: written down (its name kept). Not when the whole team goes.
create or replace function public.affiliates_before_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from affiliate_logins l where l.affiliate_id = old.id) then
    insert into affiliate_login_events (team_id, affiliate_id, affiliate_name, user_id, action)
    select t.id, old.id, old.name, (select p.id from profiles p where p.id = auth.uid()), 'deleted'
      from teams t
     where t.id = old.team_id;
  end if;
  return old;
end;
$$;
revoke all on function public.affiliates_before_delete() from public, anon, authenticated;
drop trigger if exists affiliates_before_delete on public.affiliates;
create trigger affiliates_before_delete before delete on public.affiliates
  for each row execute function public.affiliates_before_delete();

-- Access given or taken away: written down (and nothing when the team itself, or the person, is being deleted).
create or replace function public.affiliate_access_logged()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into affiliate_login_events (team_id, user_id, subject_id, action)
    select t.id, (select p.id from profiles p where p.id = auth.uid()), (select p.id from profiles p where p.id = new.user_id), 'granted'
      from teams t
     where t.id = new.team_id;
    return new;
  end if;
  insert into affiliate_login_events (team_id, user_id, subject_id, action)
  select t.id, (select p.id from profiles p where p.id = auth.uid()), (select p.id from profiles p where p.id = old.user_id), 'revoked'
    from teams t
   where t.id = old.team_id;
  return old;
end;
$$;
revoke all on function public.affiliate_access_logged() from public, anon, authenticated;
drop trigger if exists affiliate_access_logged on public.affiliate_access;
create trigger affiliate_access_logged after insert or delete on public.affiliate_access
  for each row execute function public.affiliate_access_logged();

-- ---------------------------------------------------------------------------
-- 4. Two-step sign-in (0125) on the new tables, and live updates for the list
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['affiliates', 'affiliate_access', 'affiliate_logins', 'affiliate_login_events'] loop
    execute format('drop policy if exists "two-step sign-in" on public.%I', t);
    execute format(
      'create policy "two-step sign-in" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t
    );
  end loop;
end;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.affiliates;
  exception when others then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. App setup's check
-- ---------------------------------------------------------------------------
create or replace function public.affiliates_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select to_regclass('public.affiliates') is not null
     and to_regclass('public.affiliate_access') is not null
     and to_regclass('public.affiliate_logins') is not null
     and to_regclass('public.affiliate_login_events') is not null
     and exists (select 1 from pg_proc where proname = 'affiliate_login_open')
     and exists (select 1 from pg_proc where proname = 'affiliate_login_save');
$$;
revoke all on function public.affiliates_ready() from public, anon, authenticated;
grant execute on function public.affiliates_ready() to service_role;

notify pgrst, 'reload schema';
