-- ============================================================================
-- 0089: review long videos in ClipTroop like shorts (1.25.0), more titles in
-- Thumbnail Studio, and how long files stay
--
--   * long_video_versions: every upload of a long video's edit (v1, v2…), in
--     the PRIVATE bucket "long-review-videos" (files up to 3 GB) under
--     <team id>/<project id>/<random>.<ext>. Masters, schedulers and editors
--     upload; teammates watch through short-lived signed links.
--   * long_video_comments: notes pinned to a moment of a version, with
--     replies and "resolved" (the same rules as shorts' notes, 0038).
--   * long_video_projects.approved_version_id: the version approved in
--     Review (set by long_review). keep_media: skip the clean-up
--     (masters and schedulers, long_set_keep_media).
--   * Review in ClipTroop on (the team's long_in_app_review, or the video's
--     own in_app_review, 0045): Edit → Review needs an uploaded version.
--   * teams.long_media_keep_days: a posted long video's files are deleted
--     this long after it went out (1 week by default).
--     teams.studio_keep_days: Thumbnail Studio's thumbnails that didn't win
--     are deleted this long after the video is posted (30 days by default;
--     null = keep them). The clean-up is the nightly job (lib/media-cleanup.ts).
--   * package_titles: more titles to try on one thumbnail, side by side.
--   * global_search: long videos carry their winning thumbnail (winner_id).
--   * developer_usage (0075): long videos' files count in a team's storage.
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage (private, up to 3 GB a file)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('long-review-videos', 'long-review-videos', false, 3221225472, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Masters, schedulers and editors may upload a long video's edit.
create or replace function can_upload_long_video(p_project uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from long_video_projects p
    where p.id = p_project
      and (is_team_master(p.team_id) or has_team_role(p.team_id, 'publisher') or has_team_role(p.team_id, 'editor'))
  );
$$;
revoke all on function can_upload_long_video(uuid) from public, anon;
grant execute on function can_upload_long_video(uuid) to authenticated;

-- Folder = <team>/<project>/…; the video must belong to that team.
create or replace function long_review_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  parts text[] := storage.foldername(p_name);
  v_team uuid;
  v_project uuid;
begin
  if array_length(parts, 1) is distinct from 2 then
    return false;
  end if;
  begin
    v_team := parts[1]::uuid;
    v_project := parts[2]::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from long_video_projects where id = v_project and team_id = v_team);
end;
$$;
revoke all on function long_review_path_ok(text) from public, anon;
grant execute on function long_review_path_ok(text) to authenticated;

drop policy if exists "teammates read long review videos" on storage.objects;
create policy "teammates read long review videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'long-review-videos'
    and long_review_path_ok(name)
    and ((storage.foldername(name))[1])::uuid in (select my_team_ids())
  );

drop policy if exists "editors upload long review videos" on storage.objects;
create policy "editors upload long review videos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'long-review-videos'
    and long_review_path_ok(name)
    and can_upload_long_video(((storage.foldername(name))[2])::uuid)
  );

-- Resumable uploads update the object row as chunks arrive.
drop policy if exists "editors continue long review uploads" on storage.objects;
create policy "editors continue long review uploads"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'long-review-videos'
    and long_review_path_ok(name)
    and can_upload_long_video(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "masters delete long review videos" on storage.objects;
create policy "masters delete long review videos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'long-review-videos'
    and long_review_path_ok(name)
    and is_team_master(((storage.foldername(name))[1])::uuid)
  );


-- ---------------------------------------------------------------------------
-- 2. Versions
-- ---------------------------------------------------------------------------

create table if not exists long_video_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  version_number int not null,
  storage_path text not null unique,
  file_name text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null check (mime_type like 'video/%'),
  duration_sec numeric(10, 3),
  width int,
  height int,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set by the clean-up once the file is removed from storage.
  deleted_at timestamptz,
  unique (project_id, version_number)
);
create index if not exists long_video_versions_project_idx on long_video_versions (project_id, version_number desc);
create index if not exists long_video_versions_team_idx on long_video_versions (team_id);
create index if not exists long_video_versions_uploaded_by_idx on long_video_versions (uploaded_by);

-- Number, team and uploader are set by the database; the path must be in
-- this video's folder and the file must really be in storage.
create or replace function long_video_versions_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from long_video_projects where id = new.project_id for update;
  if v_team is null then
    raise exception 'That video doesn''t exist.' using errcode = '23514';
  end if;
  new.team_id := v_team;
  if split_part(new.storage_path, '/', 1) <> v_team::text or split_part(new.storage_path, '/', 2) <> new.project_id::text then
    raise exception 'That file isn''t in this video''s folder.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'long-review-videos' and name = new.storage_path) then
    raise exception 'The upload didn''t finish. Try again.' using errcode = '23514';
  end if;
  new.version_number := coalesce((select max(version_number) from long_video_versions where project_id = new.project_id), 0) + 1;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  new.created_at := now();
  new.deleted_at := null;
  return new;
end;
$$;
drop trigger if exists long_video_versions_before_insert on long_video_versions;
create trigger long_video_versions_before_insert
  before insert on long_video_versions
  for each row execute procedure long_video_versions_before_insert();

alter table long_video_versions enable row level security;
drop policy if exists "long versions readable by teammates" on long_video_versions;
create policy "long versions readable by teammates" on long_video_versions for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "editors add long versions" on long_video_versions;
create policy "editors add long versions" on long_video_versions for insert to authenticated
  with check (can_upload_long_video(project_id));
revoke update, delete on long_video_versions from anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table long_video_versions;
exception when duplicate_object or undefined_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 3. Notes at a moment of a version
-- ---------------------------------------------------------------------------

create table if not exists long_video_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references long_video_versions(id) on delete cascade,
  project_id uuid not null references long_video_projects(id) on delete cascade,
  parent_id uuid references long_video_comments(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- Seconds into the video; null = about the whole version.
  time_sec numeric(10, 3) check (time_sec is null or time_sec >= 0),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists long_video_comments_version_idx on long_video_comments (version_id, time_sec);
create index if not exists long_video_comments_project_idx on long_video_comments (project_id);
create index if not exists long_video_comments_parent_idx on long_video_comments (parent_id);
create index if not exists long_video_comments_author_idx on long_video_comments (author_id);
create index if not exists long_video_comments_resolved_by_idx on long_video_comments (resolved_by);

create or replace function long_video_comments_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.project_id := (select project_id from long_video_versions where id = new.version_id);
    if new.project_id is null then
      raise exception 'That version doesn''t exist.' using errcode = '23514';
    end if;
    if new.parent_id is not null then
      -- Replies inherit the moment of the note they answer.
      select time_sec into new.time_sec from long_video_comments
       where id = new.parent_id and version_id = new.version_id;
      if not found then
        raise exception 'You can only reply within the same version.' using errcode = '23514';
      end if;
    end if;
    new.author_id := auth.uid();
    new.body := btrim(new.body);
    new.created_at := now();
    new.edited_at := null;
    new.resolved_at := null;
    new.resolved_by := null;
    return new;
  end if;

  -- UPDATE: only the text (by its author) and resolved (by anyone who can
  -- read the video) may change.
  if new.version_id is distinct from old.version_id or new.project_id is distinct from old.project_id
     or new.parent_id is distinct from old.parent_id or new.author_id is distinct from old.author_id
     or new.time_sec is distinct from old.time_sec or new.created_at is distinct from old.created_at then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from auth.uid() then
      raise exception 'You can only edit your own notes.' using errcode = '42501';
    end if;
    new.body := btrim(new.body);
    new.edited_at := now();
  end if;
  if new.resolved_at is distinct from old.resolved_at then
    new.resolved_at := case when new.resolved_at is null then null else now() end;
    new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
  elsif new.resolved_by is distinct from old.resolved_by then
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end;
$$;
drop trigger if exists long_video_comments_guard on long_video_comments;
create trigger long_video_comments_guard
  before insert or update on long_video_comments
  for each row execute procedure long_video_comments_guard();

alter table long_video_comments enable row level security;
drop policy if exists "long review notes readable by teammates" on long_video_comments;
create policy "long review notes readable by teammates" on long_video_comments for select to authenticated
  using (project_id in (select my_project_ids()));
drop policy if exists "teammates add long review notes" on long_video_comments;
create policy "teammates add long review notes" on long_video_comments for insert to authenticated
  with check (
    exists (select 1 from long_video_versions v where v.id = version_id and v.team_id in (select my_team_ids()))
  );
drop policy if exists "teammates update long review notes" on long_video_comments;
create policy "teammates update long review notes" on long_video_comments for update to authenticated
  using (project_id in (select my_project_ids()))
  with check (project_id in (select my_project_ids()));
drop policy if exists "authors and masters delete long review notes" on long_video_comments;
create policy "authors and masters delete long review notes" on long_video_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from long_video_projects p where p.id = project_id and is_team_master(p.team_id))
  );

do $$ begin
  alter publication supabase_realtime add table long_video_comments;
exception when duplicate_object or undefined_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 4. The video: approved version, keep switch, review gate
-- ---------------------------------------------------------------------------

alter table long_video_projects
  add column if not exists approved_version_id uuid references long_video_versions(id) on delete set null,
  add column if not exists keep_media boolean not null default false;
create index if not exists long_video_projects_approved_version_idx on long_video_projects (approved_version_id);

-- People never set these two directly: Review approves a version
-- (long_review), masters and schedulers keep the files (long_set_keep_media).
-- How the video is reviewed (in_app_review, 0045) is the master's choice: an
-- editor can't switch the upload rule off for the video they're editing.
create or replace function long_review_fields_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(current_setting('vp.long_step', true), 'off') = 'on' then
    return new;
  end if;
  if new.in_app_review is distinct from old.in_app_review and not is_team_master(old.team_id) then
    raise exception 'Only the master can change how this video is reviewed.' using errcode = '42501';
  end if;
  if new.approved_version_id is distinct from old.approved_version_id then
    new.approved_version_id := old.approved_version_id;
  end if;
  if new.keep_media is distinct from old.keep_media then
    new.keep_media := old.keep_media;
  end if;
  return new;
end;
$$;
drop trigger if exists long_review_fields_guard on long_video_projects;
create trigger long_review_fields_guard
  before update on long_video_projects
  for each row execute procedure long_review_fields_guard();

-- Masters and schedulers: keep this video's files after posting (skip the clean-up).
create or replace function long_set_keep_media(p_project uuid, p_keep boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from long_video_projects where id = p_project;
  if v_team is null or v_team not in (select my_team_ids()) then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(v_team) or has_team_role(v_team, 'publisher')) then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;
  perform set_config('vp.long_step', 'on', true);
  update long_video_projects set keep_media = coalesce(p_keep, false) where id = p_project;
  perform set_config('vp.long_step', 'off', true);
end;
$$;
revoke all on function long_set_keep_media(uuid, boolean) from public, anon;
grant execute on function long_set_keep_media(uuid, boolean) to authenticated;

-- Edit → Review (0045), now: when the video is reviewed in ClipTroop, the
-- edit has to be uploaded first.
create or replace function long_mark_edited(p_project uuid, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  p long_video_projects := long_step_project(p_project, 'edit');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_in_app boolean;
begin
  if not (is_team_master(p.team_id) or has_team_role(p.team_id, 'editor')) then
    raise exception 'Only the master or an editor can mark editing complete.' using errcode = '42501';
  end if;
  if char_length(coalesce(v_note, '')) > 4000 then
    raise exception 'Keep the note under 4,000 characters.' using errcode = '23514';
  end if;
  v_in_app := coalesce(p.in_app_review, (select long_in_app_review from teams where id = p.team_id), false);
  if v_in_app and not exists (select 1 from long_video_versions where project_id = p_project and deleted_at is null) then
    raise exception 'Upload the edit first: this video is reviewed in ClipTroop.' using errcode = '23514';
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

-- Review → Package (approve) or → Edit (request changes, with a note), 0045;
-- approving locks in the latest uploaded version.
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
         reviewed_at = now(), reviewed_by = auth.uid(),
         approved_version_id = case
           when p_approve then (select id from long_video_versions where project_id = p_project and deleted_at is null order by version_number desc limit 1)
           else approved_version_id
         end
   where id = p_project;
  perform set_config('vp.long_step', 'off', true);
  perform long_step_note(p_project, 'review',
    case when p_approve then 'Approved' || case when v_note is not null then ': ' || v_note else '.' end
         else 'Changes requested: ' || v_note end);
end;
$$;
grant execute on function long_review(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. How long files stay (Team → Defaults)
-- ---------------------------------------------------------------------------

alter table teams add column if not exists long_media_keep_days smallint not null default 7;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_long_media_keep_days_check') then
    alter table teams add constraint teams_long_media_keep_days_check check (long_media_keep_days in (3, 7, 14, 21, 30));
  end if;
end $$;
alter table teams add column if not exists studio_keep_days smallint default 30;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_studio_keep_days_check') then
    alter table teams add constraint teams_studio_keep_days_check check (studio_keep_days is null or studio_keep_days in (7, 14, 30, 90));
  end if;
end $$;
grant update (long_media_keep_days, studio_keep_days) on teams to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Thumbnail Studio: more titles to try on the same thumbnail
-- ---------------------------------------------------------------------------

create table if not exists package_titles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references long_video_projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  position double precision not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists package_titles_project_idx on package_titles (project_id, position);
create index if not exists package_titles_created_by_idx on package_titles (created_by);

create or replace function package_titles_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  if new.position = 0 then
    new.position := coalesce((select max(position) from package_titles where project_id = new.project_id), 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists package_titles_before_insert on package_titles;
create trigger package_titles_before_insert
  before insert on package_titles
  for each row execute procedure package_titles_before_insert();

alter table package_titles enable row level security;
revoke all on package_titles from anon;
grant select, insert, update, delete on package_titles to authenticated;
drop policy if exists "package titles readable by teammates" on package_titles;
create policy "package titles readable by teammates" on package_titles for select to authenticated
  using (project_id in (select my_project_ids()));
drop policy if exists "package-access adds titles" on package_titles;
create policy "package-access adds titles" on package_titles for insert to authenticated
  with check (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))));
drop policy if exists "package-access edits titles" on package_titles;
create policy "package-access edits titles" on package_titles for update to authenticated
  using (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))))
  with check (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))));
drop policy if exists "package-access deletes titles" on package_titles;
create policy "package-access deletes titles" on package_titles for delete to authenticated
  using (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))));


-- ---------------------------------------------------------------------------
-- 7. Search: a long video's winning thumbnail (0026, plus winner_id)
-- ---------------------------------------------------------------------------

-- Supabase runs migrations as a role that isn't a superuser. Then a
-- function's "set pg_trgm.word_similarity_threshold" is refused (42501,
-- "permission denied to set parameter") unless pg_trgm is already loaded in
-- this session: until then Postgres doesn't know the setting and treats it as
-- a superuser-only one. Calling one of its functions loads it. (0024 and 0026
-- got it loaded by building their trigram indexes first.)
do $$
declare
  s text := (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm');
begin
  if s is not null then
    execute format('select %I.similarity(%L, %L)', s, 'a', 'a');
  end if;
end $$;

create or replace function global_search(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  esc text;
  contains_pat text;
  prefix_pat text;
  num int;
  people jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  shorts jsonb := '[]'::jsonb;
  teams_found jsonb := '[]'::jsonb;
  master_teams jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url
         ) order by t.name), '[]'::jsonb)
    into master_teams
    from teams t
   where t.id in (select my_master_team_ids());

  -- "#12" or "12" → entry number lookup (shorts + long videos).
  if term ~ '^#?[0-9]{1,7}$' then
    num := ltrim(term, '#')::int;
  end if;

  if length(term) < 2 and num is null then
    return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                              'teams', teams_found, 'master_teams', master_teams);
  end if;

  esc := search_escape_like(ltrim(term, '#'));
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';

  -- PEOPLE (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'sort_name' order by x.score desc, x.sort_name), '[]'::jsonb)
      into people
      from (
        select
          pr.id, pr.username, pr.full_name, pr.avatar_url,
          case when pr.username is null and pr.full_name is null
               then split_part(pr.email, '@', 1) end as email_name,
          coalesce(pr.username, pr.full_name, split_part(pr.email, '@', 1)) as sort_name,
          (pr.id = auth.uid()) as is_self,
          exists (
            select 1 from team_members tm
            where tm.user_id = pr.id and tm.status = 'active'
              and tm.team_id in (select my_team_ids())
          ) as is_teammate,
          coalesce((
            select jsonb_agg(tm.team_id) from team_members tm
            where tm.user_id = pr.id and tm.team_id in (select my_master_team_ids())
          ), '[]'::jsonb) as member_of,
          coalesce((
            select jsonb_agg(ti.team_id) from team_invites ti
            where ti.invited_user_id = pr.id and ti.status = 'pending'
              and ti.expires_at > now()
              and ti.team_id in (select my_master_team_ids())
          ), '[]'::jsonb) as invited_to,
          (case
             when lower(pr.username) = term or lower(pr.full_name) = term then 3
             when lower(pr.username) like prefix_pat or lower(pr.full_name) like prefix_pat then 2
             else 0
           end
           + greatest(
               word_similarity(term, lower(coalesce(pr.username, ''))),
               word_similarity(term, lower(coalesce(pr.full_name, '')))
             )) as score
        from profiles pr
        where lower(pr.username) like contains_pat
           or lower(pr.full_name) like contains_pat
           or term <% lower(coalesce(pr.username, ''))
           or term <% lower(coalesce(pr.full_name, ''))
           or (position('@' in term) > 0 and lower(pr.email) like prefix_pat)
        order by score desc
        limit lim
      ) x;
  end if;

  -- LONG VIDEOS (RLS: your teams only). The picture: the Thumbnail Studio's
  -- winner (1.25.0), else the first thumbnail idea.
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' - 'updated_at' order by x.score desc, x.updated_at desc), '[]'::jsonb)
    into projects
    from (
      select
        p.id, p.entry_number, p.title, p.stage, p.expected_date, p.updated_at,
        alt.title as matched_title,
        th.storage_path as thumbnail_path,
        win.id as winner_id,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and p.entry_number = num then 4
           when lower(p.title) = term then 3
           when lower(p.title) like prefix_pat then 2
           when lower(p.title) like contains_pat then 1
           when alt.title is not null then 0.8
           else 0
         end
         + word_similarity(term, lower(p.title))) as score
      from long_video_projects p
      join teams t on t.id = p.team_id
      left join lateral (
        select pt.title from project_titles pt
        where pt.project_id = p.id
          and lower(pt.title) like contains_pat
          and lower(pt.title) <> lower(p.title)
        order by pt.position
        limit 1
      ) alt on true
      left join lateral (
        select th.storage_path from project_thumbnails th
        where th.project_id = p.id
        order by th.position
        limit 1
      ) th on true
      left join lateral (
        select e.id from package_entries e
        where e.project_id = p.id and e.is_winner and e.thumbnail_storage_path is not null
        order by e.position
        limit 1
      ) win on true
      where (num is not null and p.entry_number = num)
         or lower(p.title) like contains_pat
         or term <% lower(p.title)
         or alt.title is not null
      order by score desc, p.updated_at desc
      limit lim
    ) x;

  -- SHORTS (RLS: your teams only)
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' order by x.score desc, x.entry_number desc), '[]'::jsonb)
    into shorts
    from (
      select
        s.id, s.entry_number, s.title, s.stage, s.planned_date,
        (select count(*) from short_video_posts sp
          where sp.short_id = s.id and sp.platform = any(s.platforms)) as posted_count,
        cardinality(s.platforms) as platform_count,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and s.entry_number = num then 4
           when lower(s.title) = term then 3
           when lower(s.title) like prefix_pat then 2
           when lower(s.title) like contains_pat then 1
           else 0
         end
         + word_similarity(term, lower(s.title))) as score
      from short_videos s
      join teams t on t.id = s.team_id
      where (num is not null and s.entry_number = num)
         or lower(s.title) like contains_pat
         or term <% lower(s.title)
      order by score desc
      limit lim
    ) x;

  -- TEAMS (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) - 'score' order by x.score desc, x.name), '[]'::jsonb)
      into teams_found
      from (
        select
          t.id, t.name, t.color, t.logo_url,
          (t.id in (select my_master_team_ids())) as is_master,
          (select count(*) from team_members tm where tm.team_id = t.id and tm.status = 'active') as member_count,
          (case
             when lower(t.name) = term then 3
             when lower(t.name) like prefix_pat then 2
             else 0
           end + word_similarity(term, lower(t.name))) as score
        from teams t
        where lower(t.name) like contains_pat or term <% lower(t.name)
        order by score desc
        limit lim
      ) x;
  end if;

  return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                            'teams', teams_found, 'master_teams', master_teams);
end;
$$;

revoke all on function global_search(text, int) from public, anon;
grant execute on function global_search(text, int) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. The developer's Usage page (0075): long videos' files count too
-- ---------------------------------------------------------------------------

create or replace function public.developer_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  t record;
  r record;
  n_total bigint;
  t_bytes bigint;
  team_rows jsonb := '{}'::jsonb;  -- { "<team id>": { "rows": n, "bytes": estimate } }
  table_rows jsonb := '{}'::jsonb; -- { "<public table>": exact row count }
  result jsonb;
begin
  -- Exact rows of every table of ours; for the ones with a team_id, how many
  -- belong to each team (and that share of the table's size: an estimate).
  for t in
    select c.relname, c.oid,
      exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'team_id' and not a.attisdropped) as has_team
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I', t.relname) into n_total;
    table_rows := table_rows || jsonb_build_object(t.relname, n_total);
    continue when n_total = 0 or not t.has_team;
    t_bytes := pg_total_relation_size(t.oid);
    for r in execute format('select team_id::text as team, count(*) as n from public.%I where team_id is not null group by team_id', t.relname) loop
      team_rows := team_rows || jsonb_build_object(r.team, jsonb_build_object(
        'rows', coalesce((team_rows -> r.team ->> 'rows')::bigint, 0) + r.n,
        'bytes', coalesce((team_rows -> r.team ->> 'bytes')::numeric, 0) + round(t_bytes::numeric * r.n / n_total)
      ));
    end loop;
  end loop;

  with objs as (
    select
      o.bucket_id,
      case when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end as bytes,
      o.created_at,
      coalesce(o.owner, case when o.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then o.owner_id::uuid end) as owner,
      case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(o.name, '/', 1)::uuid end as first
    from storage.objects o
  ),
  owned as (
    select x.*,
      case
        when x.bucket_id in ('team-logos', 'review-videos', 'long-review-videos', 'package-thumbs', 'mockup-library', 'script-sketches') then x.first
        when x.bucket_id in ('thumbnails', 'comment-attachments') then (select p.team_id from long_video_projects p where p.id = x.first)
        when x.bucket_id = 'script-images' then (select s.team_id from scripts s where s.id = x.first)
      end as team_id
    from objs x
  )
  select jsonb_build_object(
    'at', now(),
    'database', jsonb_build_object('bytes', pg_database_size(current_database())),
    'storage', jsonb_build_object('bytes', (select coalesce(sum(bytes), 0) from owned), 'files', (select count(*) from owned)),
    'counts', jsonb_build_object(
      'people', (select count(*) from auth.users),
      'people7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'people30', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'newPeople30', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'teams', (select count(*) from teams),
      'shorts', (select count(*) from short_videos),
      'longs', (select count(*) from long_video_projects),
      'videoFiles', (select count(*) from short_video_versions where deleted_at is null)
        + (select count(*) from long_video_versions where deleted_at is null),
      'videoBytes', (select coalesce(sum(size_bytes), 0) from short_video_versions where deleted_at is null)
        + (select coalesce(sum(size_bytes), 0) from long_video_versions where deleted_at is null),
      'videoFilesCleaned', (select count(*) from short_video_versions where deleted_at is not null)
        + (select count(*) from long_video_versions where deleted_at is not null),
      'scripts', (select count(*) from scripts),
      'postsPublished', (select count(*) from social_posts where status = 'published'),
      'tasksDone', (select count(*) from tasks where state = 'done')
    ),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.bucket_id, 'files', b.files, 'bytes', b.bytes, 'last', b.last) order by b.bytes desc)
      from (select bucket_id, count(*) as files, sum(bytes) as bytes, max(created_at) as last from owned group by bucket_id) b
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('schema', x.schema, 'name', x.name, 'bytes', x.bytes, 'rows', x.rows, 'exact', x.exact) order by x.bytes desc)
      from (
        select ns.nspname as schema, c.relname as name, pg_total_relation_size(c.oid) as bytes,
          case when ns.nspname = 'public' and table_rows ? c.relname then (table_rows ->> c.relname)::bigint else greatest(c.reltuples, 0)::bigint end as rows,
          ns.nspname = 'public' and table_rows ? c.relname as exact
        from pg_class c
        join pg_namespace ns on ns.oid = c.relnamespace
        where c.relkind in ('r', 'p') and ns.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and ns.nspname not like 'pg_temp%'
        order by pg_total_relation_size(c.oid) desc
        limit 80
      ) x
    ), '[]'::jsonb),
    'uploads', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'files', d.files, 'bytes', d.bytes) order by d.day)
      from (select created_at::date as day, count(*) as files, sum(bytes) as bytes from owned where created_at > now() - interval '30 days' group by 1) d
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tm.id, 'name', tm.name, 'createdAt', tm.created_at,
        'members', (select count(*) from team_members m where m.team_id = tm.id and m.status = 'active'),
        'shorts', (select count(*) from short_videos s where s.team_id = tm.id),
        'longs', (select count(*) from long_video_projects p where p.team_id = tm.id),
        'videoFiles', (select count(*) from short_video_versions v where v.team_id = tm.id and v.deleted_at is null)
          + (select count(*) from long_video_versions v where v.team_id = tm.id and v.deleted_at is null),
        'videoBytes', (select coalesce(sum(v.size_bytes), 0) from short_video_versions v where v.team_id = tm.id and v.deleted_at is null)
          + (select coalesce(sum(v.size_bytes), 0) from long_video_versions v where v.team_id = tm.id and v.deleted_at is null),
        'files', (select count(*) from owned o where o.team_id = tm.id),
        'storageBytes', (select coalesce(sum(o.bytes), 0) from owned o where o.team_id = tm.id),
        'rows', coalesce((team_rows -> tm.id::text ->> 'rows')::bigint, 0),
        'dbBytes', coalesce((team_rows -> tm.id::text ->> 'bytes')::numeric, 0),
        'postsPublished', (select count(*) from social_posts sp where sp.team_id = tm.id and sp.status = 'published'),
        'lastActivity', (select max(coalesce(k.completed_at, k.activated_at, k.created_at)) from tasks k where k.team_id = tm.id)
      ) order by tm.created_at)
      from teams tm
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', coalesce(nullif(p.full_name, ''), p.username), 'username', p.username,
        'createdAt', u.created_at, 'lastSignIn', u.last_sign_in_at,
        'teams', (select coalesce(jsonb_agg(tt.name order by tt.name), '[]'::jsonb) from team_members m join teams tt on tt.id = m.team_id where m.user_id = u.id and m.status = 'active'),
        'videos', (select count(*) from short_video_versions v where v.uploaded_by = u.id and v.deleted_at is null)
          + (select count(*) from long_video_versions v where v.uploaded_by = u.id and v.deleted_at is null),
        'videoBytes', (select coalesce(sum(v.size_bytes), 0) from short_video_versions v where v.uploaded_by = u.id and v.deleted_at is null)
          + (select coalesce(sum(v.size_bytes), 0) from long_video_versions v where v.uploaded_by = u.id and v.deleted_at is null),
        'files', (select count(*) from owned o where o.owner = u.id and o.bucket_id not in ('review-videos', 'long-review-videos')),
        'fileBytes', (select coalesce(sum(o.bytes), 0) from owned o where o.owner = u.id and o.bucket_id not in ('review-videos', 'long-review-videos')),
        'tasksDone', (select count(*) from tasks k where k.user_id = u.id and k.state = 'done')
      ) order by u.created_at)
      from auth.users u
      left join profiles p on p.id = u.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.developer_usage() from public, anon, authenticated;
grant execute on function public.developer_usage() to service_role;
