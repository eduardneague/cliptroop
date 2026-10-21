-- ============================================================================
-- 0093: 1.28.0
--
--   * The glass look's new choices, per person (Settings → Preferences →
--     Glass): its style (simple, or liquid: like iOS), where it goes (cards
--     and bars, or everywhere: every pop-up too), the side bar see-through or
--     nearly solid, and how see-through it all is (0 frosted … 100 clear).
--   * Saved wallpapers (profile_wallpapers): up to three pictures, GIFs or
--     short videos per person for their dashboard, in their own folder of
--     the "dashboard-backgrounds" bucket (0092), one of them in use
--     (profiles.dashboard_bg_path). Each keeps how bright its top is (luma,
--     0–100, measured on upload) so the greeting over it can be dark or
--     white. Only you see, add, replace or remove yours. Removing the one in
--     use switches to your newest other one (or turns the background off);
--     replacing it keeps it in use. Today's background becomes your first.
--   * Profiles like Steam's (profile_pages, profile_stats): XP from the
--     steps you finish (a task that was your turn, the first time each step
--     of each video is done; bigger steps give more, a quarter more when
--     it's done by its date), levels (100 XP a level up to 10, 200 up to
--     20, …), picture frames that unlock with levels (checked here), your
--     own page of showcases, a background from your wallpapers, and public
--     (everyone signed in) or private (name and picture only). Your bio
--     moves onto that page so a private profile keeps it to itself.
--   * Leaving a team (leave_team): anyone but its owner (who transfers it
--     or deletes it first). Deleting your account (Settings → Account, done
--     by the app with the service key after your password) needs you on no
--     team at all; what you made on teams stays, without your name.
--
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

-- The glass look's choices --------------------------------------------------------

alter table profiles add column if not exists glass_style text not null default 'simple';
alter table profiles add column if not exists glass_scope text not null default 'cards';
alter table profiles add column if not exists glass_sidebar boolean not null default false;
alter table profiles add column if not exists glass_level smallint not null default 50;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_glass_style_check') then
    alter table profiles add constraint profiles_glass_style_check check (glass_style in ('simple', 'liquid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_glass_scope_check') then
    alter table profiles add constraint profiles_glass_scope_check check (glass_scope in ('cards', 'everywhere'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_glass_level_check') then
    alter table profiles add constraint profiles_glass_level_check check (glass_level between 0 and 100);
  end if;
end;
$$;
grant update (glass_style, glass_scope, glass_sidebar, glass_level) on profiles to authenticated;

-- Saved wallpapers --------------------------------------------------------------------

create table if not exists profile_wallpapers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  path text not null,
  luma smallint,
  created_at timestamptz not null default now(),
  -- A file in your own folder: "<your id>/<name>.<picture or video>" (like profiles.dashboard_bg_path, 0092).
  constraint profile_wallpapers_path_check check (
    split_part(path, '/', 1) = user_id::text
    and path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}\.(jpe?g|png|webp|avif|gif|mp4|webm)$'
  ),
  constraint profile_wallpapers_luma_check check (luma is null or luma between 0 and 100),
  constraint profile_wallpapers_path_key unique (path)
);
create index if not exists profile_wallpapers_user_idx on profile_wallpapers (user_id, created_at);

alter table profile_wallpapers enable row level security;
drop policy if exists "see your wallpapers" on profile_wallpapers;
create policy "see your wallpapers" on profile_wallpapers for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "add your wallpapers" on profile_wallpapers;
create policy "add your wallpapers" on profile_wallpapers for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "replace your wallpapers" on profile_wallpapers;
create policy "replace your wallpapers" on profile_wallpapers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "remove your wallpapers" on profile_wallpapers;
create policy "remove your wallpapers" on profile_wallpapers for delete to authenticated using (user_id = (select auth.uid()));

revoke all on profile_wallpapers from anon, authenticated;
grant select, delete on profile_wallpapers to authenticated;
grant insert (path, luma) on profile_wallpapers to authenticated;
grant update (path, luma) on profile_wallpapers to authenticated;

-- Three at most (counted with your profile row locked, so two uploads at once can't make four); always yours, dated now.
create or replace function profile_wallpapers_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
    end if;
    new.created_at := now();
    perform 1 from profiles where id = new.user_id for update;
    if (select count(*) from profile_wallpapers where user_id = new.user_id) >= 3 then
      raise exception 'You can keep 3 wallpapers. Remove or replace one first.' using errcode = 'P0001';
    end if;
  elsif new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'A wallpaper stays with its owner.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_wallpapers_write on profile_wallpapers;
create trigger profile_wallpapers_write before insert or update on profile_wallpapers
  for each row execute procedure profile_wallpapers_write();

-- The one in use follows: replaced → the new file; removed → your newest other one, or the background off.
create or replace function profile_wallpapers_follow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_next text;
begin
  if tg_op = 'UPDATE' then
    if new.path is distinct from old.path then
      update profiles set dashboard_bg_path = new.path where id = new.user_id and dashboard_bg_path = old.path;
    end if;
    -- A profile background from it: the new file (its brightness is copied by profile_pages_write).
    update profile_pages set bg_path = new.path where user_id = new.user_id and bg_path = old.path;
    return new;
  end if;
  select path into v_next from profile_wallpapers where user_id = old.user_id and id <> old.id order by created_at desc limit 1;
  update profiles
     set dashboard_bg_path = v_next,
         dashboard_bg_on = case when v_next is null then false else dashboard_bg_on end
   where id = old.user_id and dashboard_bg_path = old.path;
  update profile_pages set bg_path = null where user_id = old.user_id and bg_path = old.path;
  return old;
end;
$$;
drop trigger if exists profile_wallpapers_follow on profile_wallpapers;
create trigger profile_wallpapers_follow after update of path, luma or delete on profile_wallpapers
  for each row execute procedure profile_wallpapers_follow();

-- Today's background (1.27.5) becomes your first saved wallpaper.
insert into profile_wallpapers (user_id, path)
select p.id, p.dashboard_bg_path
  from profiles p
 where p.dashboard_bg_path is not null
   and split_part(p.dashboard_bg_path, '/', 1) = p.id::text
   and not exists (select 1 from profile_wallpapers w where w.path = p.dashboard_bg_path)
on conflict do nothing;

-- Profiles: XP, levels, frames, a page of your own ------------------------------------

-- Which kind of step a task is (achievements count them), and its XP: bigger steps give more.
-- The same numbers as lib/profile/progress.ts.
create or replace function vp_task_cat(p_kind text, p_stage text)
returns text
language sql
immutable
as $$
  select case
    when p_stage = 'script' and p_kind in ('short', 'long') then 'script'
    when (p_kind = 'short' and p_stage = 'editing') or (p_kind = 'long' and p_stage = 'edit') then 'edit'
    when p_kind = 'long' and p_stage = 'film' then 'film'
    when p_kind = 'long' and p_stage = 'research' then 'research'
    when p_stage in ('review', 'staging') then 'review'
    when p_kind = 'long' and p_stage = 'package' then 'package'
    when (p_kind = 'short' and p_stage = 'ready') or (p_kind = 'long' and p_stage = 'publish') then 'publish'
    when p_kind = 'meeting' then 'action'
    else 'other'
  end;
$$;

create or replace function vp_task_xp(p_kind text, p_stage text)
returns int
language sql
immutable
as $$
  select case
    when p_kind = 'long' and p_stage = 'edit' then 90
    when p_kind = 'long' and p_stage = 'film' then 70
    when p_kind = 'long' and p_stage = 'script' then 60
    when p_kind = 'long' and p_stage = 'research' then 40
    when p_kind = 'short' and p_stage = 'editing' then 40
    when p_kind = 'long' and p_stage = 'package' then 35
    when p_kind = 'short' and p_stage = 'script' then 30
    when p_kind = 'long' and p_stage = 'review' then 25
    when p_kind = 'long' and p_stage = 'publish' then 20
    when p_kind in ('short', 'script') and p_stage = 'review' then 15
    else 10
  end;
$$;

-- Total XP to reach a level: 100 a level up to 10, 200 a level up to 20, … (like Steam).
create or replace function vp_level_floor(p_level int)
returns bigint
language sql
immutable
as $$
  select 500::bigint * (greatest(p_level, 0) / 10) * (greatest(p_level, 0) / 10 + 1)
       + 100::bigint * (greatest(p_level, 0) % 10) * (greatest(p_level, 0) / 10 + 1);
$$;

create or replace function vp_level_for(p_xp bigint)
returns int
language plpgsql
immutable
as $$
declare
  a int := 0;
begin
  if p_xp is null or p_xp <= 0 then
    return 0;
  end if;
  while 500::bigint * (a + 1) * (a + 2) <= p_xp loop
    a := a + 1;
  end loop;
  return a * 10 + least(9, ((p_xp - 500::bigint * a * (a + 1)) / (100 * (a + 1)))::int);
end;
$$;

-- The level a picture frame unlocks at.
create or replace function vp_frame_level(p_frame text)
returns int
language sql
immutable
as $$
  select case p_frame
    when 'ring' then 1 when 'dashed' then 3 when 'glow' then 5 when 'duo' then 8 when 'orbit' then 12
    when 'sunburst' then 16 when 'laurel' then 20 when 'prism' then 30 when 'crown' then 50
    else 0
  end;
$$;

-- Someone's XP: each step of each video counts once (the first time it's done), only when it was
-- their turn (a step skipped over gives nothing), a quarter more when done by its date.
create or replace function profile_xp(p_user uuid)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(vp_task_xp(d.kind, d.stage) + case when d.on_time then round(vp_task_xp(d.kind, d.stage) * 0.25)::int else 0 end), 0)
    from (
      select distinct on (t.kind, t.item_id, t.stage)
             t.kind, t.stage, (t.due_date is not null and (t.completed_at at time zone 'UTC')::date <= t.due_date) as on_time
        from tasks t
       where t.user_id = p_user and t.state = 'done' and t.activated_at is not null and t.completed_at is not null
       order by t.kind, t.item_id, t.stage, t.completed_at
    ) d;
$$;
revoke all on function profile_xp(uuid) from public, anon, authenticated;

-- A page of your own: public (everyone signed in) or private (others see only your name and
-- picture), your bio, your showcases, a picture frame, a background from your wallpapers.
create table if not exists profile_pages (
  user_id uuid primary key default auth.uid() references profiles(id) on delete cascade,
  public boolean not null default true,
  bio text,
  layout jsonb,
  frame text not null default 'none',
  bg_path text,
  bg_luma smallint,
  updated_at timestamptz not null default now(),
  constraint profile_pages_bio_check check (bio is null or char_length(bio) <= 300),
  constraint profile_pages_layout_check check (layout is null or (jsonb_typeof(layout) = 'object' and pg_column_size(layout) <= 32768)),
  constraint profile_pages_frame_check check (frame in ('none', 'ring', 'dashed', 'glow', 'duo', 'orbit', 'sunburst', 'laurel', 'prism', 'crown')),
  constraint profile_pages_bg_check check (
    bg_path is null
    or (split_part(bg_path, '/', 1) = user_id::text
        and bg_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}\.(jpe?g|png|webp|avif|gif|mp4|webm)$')
  )
);

alter table profile_pages enable row level security;
drop policy if exists "see public profile pages and your own" on profile_pages;
create policy "see public profile pages and your own" on profile_pages for select to authenticated
  using (user_id = (select auth.uid()) or public);
drop policy if exists "make your profile page" on profile_pages;
create policy "make your profile page" on profile_pages for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "change your profile page" on profile_pages;
create policy "change your profile page" on profile_pages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on profile_pages from anon, authenticated;
grant select on profile_pages to authenticated;
grant insert (public, bio, layout, frame, bg_path) on profile_pages to authenticated;
grant update (public, bio, layout, frame, bg_path) on profile_pages to authenticated;

-- Always yours; a frame only once you've reached its level; a background only from your own
-- wallpapers (its brightness comes with it, for the words over it).
create or replace function profile_pages_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_need int;
  v_luma smallint;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
    end if;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'A profile page stays with its owner.' using errcode = '42501';
  end if;
  if new.frame <> 'none' and (tg_op = 'INSERT' or new.frame is distinct from old.frame) then
    v_need := vp_frame_level(new.frame);
    if v_need > vp_level_for(profile_xp(new.user_id)) then
      raise exception 'Reach level % to use this frame.', v_need using errcode = 'P0001';
    end if;
  end if;
  if new.bg_path is null then
    new.bg_luma := null;
  elsif tg_op = 'INSERT' or new.bg_path is distinct from old.bg_path or new.bg_luma is distinct from old.bg_luma then
    select luma into v_luma from profile_wallpapers where user_id = new.user_id and path = new.bg_path;
    if not found then
      raise exception 'Pick one of your wallpapers for the background.' using errcode = 'P0001';
    end if;
    new.bg_luma := v_luma;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists profile_pages_write on profile_pages;
create trigger profile_pages_write before insert or update on profile_pages
  for each row execute procedure profile_pages_write();

-- Bios move onto the page (a private profile keeps its bio to itself; profiles are readable by everyone signed in).
insert into profile_pages (user_id, bio)
select p.id, left(btrim(p.bio), 300)
  from profiles p
 where p.bio is not null and btrim(p.bio) <> ''
on conflict (user_id) do update set bio = coalesce(profile_pages.bio, excluded.bio);
update profiles set bio = null where bio is not null;

-- Someone's numbers for their profile: XP and level, steps finished (by kind, on time), the dates
-- achievements were reached (the 1st, 5th, 10th, … of each kind; streaks; levels; a second team),
-- a year of days. Null when the profile is private (unless it's yours) or not there. Days are UTC.
create or replace function profile_stats(p_user uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  if auth.uid() is null or p_user is null then
    return null;
  end if;
  if p_user <> auth.uid() and coalesce((select public from profile_pages where user_id = p_user), true) is not true then
    return null;
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    return null;
  end if;

  with done as (
    select distinct on (t.kind, t.item_id, t.stage)
           t.kind, t.item_id, t.stage, t.team_id, t.completed_at as at,
           (t.due_date is not null and (t.completed_at at time zone 'UTC')::date <= t.due_date) as on_time,
           (t.due_date is not null) as dated
      from tasks t
     where t.user_id = p_user and t.state = 'done' and t.activated_at is not null and t.completed_at is not null
     order by t.kind, t.item_id, t.stage, t.completed_at
  ), s as (
    select d.*, vp_task_cat(d.kind, d.stage) as cat,
           vp_task_xp(d.kind, d.stage) + case when d.on_time then round(vp_task_xp(d.kind, d.stage) * 0.25)::int else 0 end as xp
      from done d
  ), o as (
    select s.*,
           sum(s.xp) over w as run_xp,
           row_number() over w as n_all,
           row_number() over (partition by s.cat order by s.at, s.item_id, s.stage) as n_cat,
           row_number() over (partition by s.on_time order by s.at, s.item_id, s.stage) as n_on
      from s
    window w as (order by s.at, s.item_id, s.stage rows between unbounded preceding and current row)
  ), days as (
    select distinct (o.at at time zone 'UTC')::date as d from o
  ), runs as (
    select min(x.d) as s0, max(x.d) as e0, count(*)::int as len
      from (select days.d, days.d - (row_number() over (order by days.d))::int as g from days) x
     group by x.g
  )
  select jsonb_build_object(
    'xp', coalesce((select sum(o.xp) from o), 0),
    'tasks', (select count(*) from o),
    'on_time', (select count(*) from o where o.on_time),
    'dated', (select count(*) from o where o.dated),
    'videos', (select count(distinct o.item_id) from o where o.kind in ('short', 'long')),
    'teams', (select count(distinct o.team_id) from o),
    'first_at', (select min(o.at) from o),
    'last_at', (select max(o.at) from o),
    'by', coalesce((select jsonb_object_agg(c.cat, c.n) from (select o.cat, count(*) as n from o group by o.cat) c), '{}'::jsonb),
    'ranks', coalesce((
      select jsonb_object_agg(q.k, q.r)
        from (
          select 'all' as k, jsonb_object_agg(o.n_all::text, o.at) as r from o where o.n_all in (1, 5, 10, 25, 50, 100, 250, 500, 1000)
          union all
          select o.cat, jsonb_object_agg(o.n_cat::text, o.at) from o where o.n_cat in (1, 5, 10, 25, 50, 100, 250, 500, 1000) group by o.cat
          union all
          select 'ontime', jsonb_object_agg(o.n_on::text, o.at) from o where o.on_time and o.n_on in (1, 5, 10, 25, 50, 100, 250, 500, 1000)
        ) q
       where q.r is not null), '{}'::jsonb),
    'team_dates', coalesce((
      select jsonb_object_agg(t.rn::text, t.first)
        from (select f.first, row_number() over (order by f.first) as rn from (select min(o.at) as first from o group by o.team_id) f) t
       where t.rn in (2, 3)), '{}'::jsonb),
    'levels', coalesce((
      select jsonb_object_agg(l::text, (select min(o.at) from o where o.run_xp >= vp_level_floor(l)))
        from unnest(array[5, 10, 25, 50]) as l
       where exists (select 1 from o where o.run_xp >= vp_level_floor(l))), '{}'::jsonb),
    'streak', jsonb_build_object(
      'best', coalesce((select max(runs.len) from runs), 0),
      'current', coalesce((select runs.len from runs where runs.e0 >= (now() at time zone 'UTC')::date - 1 order by runs.e0 desc limit 1), 0),
      'dates', coalesce((
        select jsonb_object_agg(n::text, (select min(runs.s0 + (n - 1)) from runs where runs.len >= n))
          from unnest(array[3, 7, 30]) as n
         where exists (select 1 from runs where runs.len >= n)), '{}'::jsonb)),
    'days', coalesce((
      select jsonb_object_agg(dd.d::text, dd.n)
        from (select (o.at at time zone 'UTC')::date as d, count(*) as n from o where o.at >= now() - interval '372 days' group by 1) dd), '{}'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function profile_stats(uuid) from public, anon;
grant execute on function profile_stats(uuid) to authenticated;

-- Leaving a team -------------------------------------------------------------------------

-- Anyone on a team but its owner (who transfers it or deletes it first). Their open steps go
-- (the task triggers on team_members); what they made stays with the team.
create or replace function leave_team(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select owner_id into v_owner from teams where id = p_team;
  if not found then
    raise exception 'That team isn''t there any more.' using errcode = 'P0002';
  end if;
  if v_owner = auth.uid() then
    raise exception 'You own this team: transfer it to someone first, or delete it.' using errcode = 'P0001';
  end if;
  select id into v_member from team_members where team_id = p_team and user_id = auth.uid() and status = 'active' limit 1;
  if v_member is null then
    raise exception 'You''re not on this team.' using errcode = 'P0002';
  end if;
  delete from ownership_transfer_requests where team_id = p_team and (to_user_id = auth.uid() or from_user_id = auth.uid());
  delete from team_members where team_id = p_team and user_id = auth.uid();
end;
$$;
revoke all on function leave_team(uuid) from public, anon;
grant execute on function leave_team(uuid) to authenticated;
