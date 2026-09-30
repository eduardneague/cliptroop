-- ============================================================================
-- 0045: the long-video flow
--
--   Ideate → Research → Script → Film → Edit → Review → Package → Post → Posted
--
--   * Film: "Filmed and uploaded to the NAS" (+ optional NAS folder path).
--   * Edit: the editor leaves a note and marks editing complete.
--   * Review: masters approve (→ Package) or request changes (→ Edit).
--   * Post: toggles per platform; when every platform is ticked the video
--     is Posted ('done'). Unticking moves it back to Post.
--   * Script: exactly like shorts: scripters per video (team default +
--     extras); only they and masters edit the script.
--   * Team defaults: long-video description, default scripter, and whether
--     in-app video review is on (each video can override it).
--
-- Every step action is a function that checks the person's role AND the
-- current step, and writes a line into that step's chat.
-- Needs 0044 first. Staging first, then production.
-- ============================================================================

-- Review is the master's step.
create or replace function role_allows_stage(p_role role_type, p_stage pipeline_stage)
returns boolean
language sql
immutable
as $$
  select case p_role
    when 'master'     then true
    when 'researcher' then p_stage = 'research'
    when 'scripter'   then p_stage = 'script'
    when 'filmer'     then p_stage = 'film'
    when 'editor'     then p_stage = 'edit'
    when 'packager'   then p_stage = 'package'
    when 'publisher'  then p_stage = 'publish'
    else false
  end;
$$;



-- The stage guard: masters change stages; the checked step actions below
-- may too (flag on for their own update only, like vp.renumber).
create or replace function guard_project_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'A project can''t be moved to another team.' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A project''s creator can''t be changed.' using errcode = '42501';
  end if;
  if new.entry_number is distinct from old.entry_number
     and coalesce(current_setting('vp.renumber', true), 'off') <> 'on' then
    raise exception 'Entry numbers can''t be changed.' using errcode = '42501';
  end if;
  if new.stage is distinct from old.stage
     and not is_team_master(old.team_id)
     and coalesce(current_setting('vp.long_step', true), 'off') <> 'on' then
    raise exception 'Only the master can change a project''s stage.' using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Project fields
-- ---------------------------------------------------------------------------

alter table long_video_projects
  add column if not exists nas_path text check (nas_path is null or char_length(nas_path) <= 500),
  add column if not exists filmed_at timestamptz,
  add column if not exists filmed_by uuid references profiles(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references profiles(id) on delete set null,
  add column if not exists edit_note text check (edit_note is null or char_length(edit_note) <= 4000),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 4000),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references profiles(id) on delete set null,
  -- null = follow the team default
  add column if not exists in_app_review boolean,
  add column if not exists platforms text[] not null default '{youtube}',
  add column if not exists posted_at timestamptz;
create index if not exists long_video_projects_filmed_by_idx on long_video_projects (filmed_by);
create index if not exists long_video_projects_edited_by_idx on long_video_projects (edited_by);
create index if not exists long_video_projects_reviewed_by_idx on long_video_projects (reviewed_by);

alter table long_video_projects drop constraint if exists long_video_projects_platforms_check;
alter table long_video_projects add constraint long_video_projects_platforms_check
  check (platforms <@ array['youtube', 'facebook', 'instagram', 'tiktok'] and cardinality(platforms) >= 1);

-- Masters choose the platforms and the review mode; everything else about
-- the steps goes through the functions below.
grant update (platforms, in_app_review) on long_video_projects to authenticated;

alter table teams
  add column if not exists default_long_description text not null default ''
    check (char_length(default_long_description) <= 5000),
  add column if not exists long_in_app_review boolean not null default false,
  add column if not exists default_long_scripter_member_id uuid references team_members(id) on delete set null;
create index if not exists teams_default_long_scripter_idx on teams (default_long_scripter_member_id);
grant update (default_long_description, long_in_app_review, default_long_scripter_member_id) on teams to authenticated;


-- ---------------------------------------------------------------------------
-- Posted per platform
-- ---------------------------------------------------------------------------

create table if not exists long_video_posts (
  project_id uuid not null references long_video_projects(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'facebook', 'instagram', 'tiktok')),
  url text check (url is null or char_length(url) <= 500),
  posted_by uuid references profiles(id) on delete set null,
  posted_at timestamptz not null default now(),
  primary key (project_id, platform)
);
create index if not exists long_video_posts_posted_by_idx on long_video_posts (posted_by);
alter table long_video_posts enable row level security;
revoke all on long_video_posts from anon, authenticated;
grant select on long_video_posts to authenticated;
drop policy if exists "teammates see long posts" on long_video_posts;
create policy "teammates see long posts" on long_video_posts for select to authenticated
  using (project_id in (select id from long_video_projects where team_id in (select my_team_ids())));


-- ---------------------------------------------------------------------------
-- Scripters per video (like shorts)
-- ---------------------------------------------------------------------------

create table if not exists long_video_scripters (
  project_id uuid not null references long_video_projects(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (project_id, team_member_id)
);
create index if not exists long_video_scripters_member_idx on long_video_scripters (team_member_id);
create index if not exists long_video_scripters_added_by_idx on long_video_scripters (added_by);

create or replace function long_video_scripters_check()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from long_video_projects p join team_members tm on tm.team_id = p.team_id
     where p.id = new.project_id and tm.id = new.team_member_id and tm.status = 'active'
  ) then
    raise exception 'Scripters must be active members of this team.' using errcode = '23514';
  end if;
  new.added_by := coalesce(auth.uid(), new.added_by);
  new.added_at := now();
  return new;
end;
$$;
drop trigger if exists long_video_scripters_check on long_video_scripters;
create trigger long_video_scripters_check before insert on long_video_scripters
  for each row execute procedure long_video_scripters_check();

alter table long_video_scripters enable row level security;
drop policy if exists "long scripters readable by teammates" on long_video_scripters;
create policy "long scripters readable by teammates" on long_video_scripters for select to authenticated
  using (project_id in (select id from long_video_projects where team_id in (select my_team_ids())));
drop policy if exists "masters add long scripters" on long_video_scripters;
create policy "masters add long scripters" on long_video_scripters for insert to authenticated
  with check (exists (select 1 from long_video_projects p where p.id = project_id and is_team_master(p.team_id)));
drop policy if exists "masters remove long scripters" on long_video_scripters;
create policy "masters remove long scripters" on long_video_scripters for delete to authenticated
  using (exists (select 1 from long_video_projects p where p.id = project_id and is_team_master(p.team_id)));
revoke update on long_video_scripters from anon, authenticated;

-- New long videos get the team's default scripter.
create or replace function long_add_default_scripter()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m uuid;
begin
  select default_long_scripter_member_id into m from teams where id = new.team_id;
  if m is not null and exists (select 1 from team_members where id = m and team_id = new.team_id and status = 'active') then
    insert into long_video_scripters (project_id, team_member_id, added_by) values (new.id, m, auth.uid()) on conflict do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists long_add_default_scripter on long_video_projects;
create trigger long_add_default_scripter after insert on long_video_projects
  for each row execute procedure long_add_default_scripter();

-- Scripts: long videos now follow the same rule as shorts.
create or replace function can_edit_script_row(p_team uuid, p_short uuid, p_long uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select is_team_master(p_team)
    or (p_short is not null and exists (
          select 1 from short_scripters ss join team_members tm on tm.id = ss.team_member_id
           where ss.short_id = p_short and tm.user_id = auth.uid() and tm.status = 'active'))
    or (p_long is not null and exists (
          select 1 from long_video_scripters ls join team_members tm on tm.id = ls.team_member_id
           where ls.project_id = p_long and tm.user_id = auth.uid() and tm.status = 'active'));
$$;


-- ---------------------------------------------------------------------------
-- Step actions
-- ---------------------------------------------------------------------------

-- A line in the step's chat, so the history lives where the team talks.
create or replace function long_step_note(p_project uuid, p_stage pipeline_stage, p_body text)
returns void
language sql
security definer set search_path = public
as $$
  insert into project_comments (project_id, stage, author_id, body)
  values (p_project, p_stage, auth.uid(), p_body);
$$;
revoke all on function long_step_note(uuid, pipeline_stage, text) from public, anon, authenticated;

create or replace function long_step_project(p_project uuid, p_stage pipeline_stage)
returns long_video_projects
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects;
begin
  select * into p from long_video_projects where id = p_project for update;
  if p.id is null or p.team_id not in (select my_team_ids()) then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;
  if p.stage <> p_stage then
    raise exception 'This video isn''t at that step anymore. Refresh the page.' using errcode = '23514';
  end if;
  return p;
end;
$$;
revoke all on function long_step_project(uuid, pipeline_stage) from public, anon, authenticated;

-- Film → Edit
create or replace function long_mark_filmed(p_project uuid, p_nas_path text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects := long_step_project(p_project, 'film');
  v_path text := nullif(btrim(coalesce(p_nas_path, '')), '');
begin
  if not (is_team_master(p.team_id) or has_team_role(p.team_id, 'filmer')) then
    raise exception 'Only the master or a filmer can mark it filmed.' using errcode = '42501';
  end if;
  perform set_config('vp.long_step', 'on', true);
  update long_video_projects
     set stage = 'edit', filmed_at = now(), filmed_by = auth.uid(), nas_path = coalesce(v_path, nas_path)
   where id = p_project;
  perform set_config('vp.long_step', 'off', true);
  perform long_step_note(p_project, 'film',
    'Filmed and uploaded to the NAS' || case when v_path is not null then ': ' || v_path else '.' end);
end;
$$;
grant execute on function long_mark_filmed(uuid, text) to authenticated;

-- Edit → Review
create or replace function long_mark_edited(p_project uuid, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects := long_step_project(p_project, 'edit');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (is_team_master(p.team_id) or has_team_role(p.team_id, 'editor')) then
    raise exception 'Only the master or an editor can mark editing complete.' using errcode = '42501';
  end if;
  if char_length(coalesce(v_note, '')) > 4000 then
    raise exception 'Keep the note under 4,000 characters.' using errcode = '23514';
  end if;
  perform set_config('vp.long_step', 'on', true);
  update long_video_projects
     set stage = 'review', edited_at = now(), edited_by = auth.uid(), edit_note = v_note, review_note = null
   where id = p_project;
  perform set_config('vp.long_step', 'off', true);
  perform long_step_note(p_project, 'edit', 'Editing complete' || case when v_note is not null then ': ' || v_note else '.' end);
end;
$$;
grant execute on function long_mark_edited(uuid, text) to authenticated;

-- Review → Package (approve) or → Edit (request changes, with a note)
create or replace function long_review(p_project uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects := long_step_project(p_project, 'review');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_team_master(p.team_id) then
    raise exception 'Only the master can review.' using errcode = '42501';
  end if;
  if not p_approve and v_note is null then
    raise exception 'Say what needs changing.' using errcode = '23514';
  end if;
  if char_length(coalesce(v_note, '')) > 4000 then
    raise exception 'Keep the note under 4,000 characters.' using errcode = '23514';
  end if;
  perform set_config('vp.long_step', 'on', true);
  update long_video_projects
     set stage = case when p_approve then 'package'::pipeline_stage else 'edit'::pipeline_stage end,
         review_note = case when p_approve then null else v_note end,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_project;
  perform set_config('vp.long_step', 'off', true);
  perform long_step_note(p_project, 'review',
    case when p_approve then 'Approved' || case when v_note is not null then ': ' || v_note else '.' end
         else 'Changes requested: ' || v_note end);
end;
$$;
grant execute on function long_review(uuid, boolean, text) to authenticated;

-- Post: tick / untick a platform. All ticked → Posted; any unticked → Post.
create or replace function long_set_posted(p_project uuid, p_platform text, p_posted boolean, p_url text default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects;
  v_all boolean;
begin
  select * into p from long_video_projects where id = p_project for update;
  if p.id is null or p.team_id not in (select my_team_ids()) then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;
  if p.stage not in ('publish', 'done') then
    raise exception 'Move it to the Post step first.' using errcode = '23514';
  end if;
  if not (is_team_master(p.team_id) or has_team_role(p.team_id, 'publisher')) then
    raise exception 'Only the master or a scheduler can mark posts.' using errcode = '42501';
  end if;
  if not (p_platform = any (p.platforms)) then
    raise exception 'This video isn''t planned for that platform.' using errcode = '23514';
  end if;

  if p_posted then
    insert into long_video_posts (project_id, platform, url, posted_by)
    values (p_project, p_platform, nullif(btrim(coalesce(p_url, '')), ''), auth.uid())
    on conflict (project_id, platform) do update set url = excluded.url;
  else
    delete from long_video_posts where project_id = p_project and platform = p_platform;
  end if;

  select bool_and(exists (select 1 from long_video_posts lp where lp.project_id = p_project and lp.platform = x))
    into v_all from unnest(p.platforms) as x;

  if v_all and p.stage <> 'done' then
    perform set_config('vp.long_step', 'on', true);
  update long_video_projects set stage = 'done', posted_at = now() where id = p_project;
  perform set_config('vp.long_step', 'off', true);
    perform long_step_note(p_project, 'publish', 'Posted everywhere.');
    return 'done';
  elsif not v_all and p.stage = 'done' then
    perform set_config('vp.long_step', 'on', true);
  update long_video_projects set stage = 'publish', posted_at = null where id = p_project;
  perform set_config('vp.long_step', 'off', true);
    return 'publish';
  end if;
  return p.stage::text;
end;
$$;
grant execute on function long_set_posted(uuid, text, boolean, text) to authenticated;
