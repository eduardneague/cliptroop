-- ============================================================================
-- 0038: in-app video review (replaces Frame.io)
--
--   * short_video_versions: every upload of a short's video (v1, v2, …).
--     Files live in the PRIVATE "review-videos" bucket under
--     <team id>/<short id>/<random>.<ext>; playback uses short-lived signed
--     links. Masters, the short's editor and schedulers can upload.
--   * short_video_comments: notes pinned to a moment in a version (or to
--     the whole version), with replies and "resolved".
--   * short_videos.approved_version_id: the exact version that was
--     approved; the one we'll post. short_videos.keep_media: skip cleanup.
--   * Editing → In review now needs an uploaded version (a Frame.io link
--     still works as a fallback during the switch).
--
-- Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage bucket (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('review-videos', 'review-videos', false)
on conflict (id) do update set public = false;

create or replace function can_upload_short_video(p_short uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from short_videos s
    where s.id = p_short
      and (
        is_team_master(s.team_id)
        or has_team_role(s.team_id, 'publisher')
        or exists (
          select 1 from team_members tm
          where tm.id = s.editor_member_id and tm.user_id = auth.uid() and tm.status = 'active'
        )
      )
  );
$$;

-- Folder = <team>/<short>/…; the short must belong to that team.
create or replace function review_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  parts text[] := storage.foldername(p_name);
  v_team uuid;
  v_short uuid;
begin
  if array_length(parts, 1) is distinct from 2 then
    return false;
  end if;
  begin
    v_team := parts[1]::uuid;
    v_short := parts[2]::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from short_videos where id = v_short and team_id = v_team);
end;
$$;

drop policy if exists "teammates read review videos" on storage.objects;
create policy "teammates read review videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'review-videos'
    and review_path_ok(name)
    and ((storage.foldername(name))[1])::uuid in (select my_team_ids())
  );

drop policy if exists "editors upload review videos" on storage.objects;
create policy "editors upload review videos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review-videos'
    and review_path_ok(name)
    and can_upload_short_video(((storage.foldername(name))[2])::uuid)
  );

-- Resumable uploads update the object row as chunks arrive.
drop policy if exists "editors continue review uploads" on storage.objects;
create policy "editors continue review uploads"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'review-videos'
    and review_path_ok(name)
    and can_upload_short_video(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "masters delete review videos" on storage.objects;
create policy "masters delete review videos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-videos'
    and review_path_ok(name)
    and is_team_master(((storage.foldername(name))[1])::uuid)
  );


-- ---------------------------------------------------------------------------
-- 2. Versions
-- ---------------------------------------------------------------------------

create table if not exists short_video_versions (
  id uuid primary key default gen_random_uuid(),
  short_id uuid not null references short_videos(id) on delete cascade,
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
  -- Set by the cleanup job once the file is removed from storage.
  deleted_at timestamptz,
  unique (short_id, version_number)
);
create index if not exists short_video_versions_short_idx on short_video_versions (short_id, version_number desc);
create index if not exists short_video_versions_team_idx on short_video_versions (team_id);
create index if not exists short_video_versions_uploaded_by_idx on short_video_versions (uploaded_by);

-- Number, team and uploader are set by the database; the path must be in
-- this short's folder and the file must really be in storage.
create or replace function short_video_versions_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from short_videos where id = new.short_id for update;
  if v_team is null then
    raise exception 'That short doesn''t exist.' using errcode = '23514';
  end if;
  new.team_id := v_team;
  if split_part(new.storage_path, '/', 1) <> v_team::text or split_part(new.storage_path, '/', 2) <> new.short_id::text then
    raise exception 'That file isn''t in this short''s folder.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'review-videos' and name = new.storage_path) then
    raise exception 'The upload didn''t finish. Try again.' using errcode = '23514';
  end if;
  new.version_number := coalesce((select max(version_number) from short_video_versions where short_id = new.short_id), 0) + 1;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  new.created_at := now();
  new.deleted_at := null;
  return new;
end;
$$;
drop trigger if exists short_video_versions_before_insert on short_video_versions;
create trigger short_video_versions_before_insert
  before insert on short_video_versions
  for each row execute procedure short_video_versions_before_insert();

alter table short_video_versions enable row level security;
drop policy if exists "versions readable by teammates" on short_video_versions;
create policy "versions readable by teammates" on short_video_versions for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "editors add versions" on short_video_versions;
create policy "editors add versions" on short_video_versions for insert to authenticated
  with check (can_upload_short_video(short_id));
revoke update, delete on short_video_versions from anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table short_video_versions;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 3. Timestamped comments
-- ---------------------------------------------------------------------------

create table if not exists short_video_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references short_video_versions(id) on delete cascade,
  short_id uuid not null references short_videos(id) on delete cascade,
  parent_id uuid references short_video_comments(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- Seconds into the video; null = about the whole version.
  time_sec numeric(10, 3) check (time_sec is null or time_sec >= 0),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists short_video_comments_version_idx on short_video_comments (version_id, time_sec);
create index if not exists short_video_comments_short_idx on short_video_comments (short_id);
create index if not exists short_video_comments_parent_idx on short_video_comments (parent_id);
create index if not exists short_video_comments_author_idx on short_video_comments (author_id);
create index if not exists short_video_comments_resolved_by_idx on short_video_comments (resolved_by);

create or replace function short_video_comments_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_master boolean;
begin
  if tg_op = 'INSERT' then
    new.short_id := (select short_id from short_video_versions where id = new.version_id);
    if new.short_id is null then
      raise exception 'That version doesn''t exist.' using errcode = '23514';
    end if;
    if new.parent_id is not null then
      -- Replies inherit the moment of the note they answer.
      select time_sec into new.time_sec from short_video_comments
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
  -- read the short) may change.
  if new.version_id is distinct from old.version_id or new.short_id is distinct from old.short_id
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
drop trigger if exists short_video_comments_guard on short_video_comments;
create trigger short_video_comments_guard
  before insert or update on short_video_comments
  for each row execute procedure short_video_comments_guard();

alter table short_video_comments enable row level security;
drop policy if exists "review notes readable by teammates" on short_video_comments;
create policy "review notes readable by teammates" on short_video_comments for select to authenticated
  using (short_id in (select my_short_ids()));
drop policy if exists "teammates add review notes" on short_video_comments;
create policy "teammates add review notes" on short_video_comments for insert to authenticated
  with check (
    exists (select 1 from short_video_versions v where v.id = version_id and v.team_id in (select my_team_ids()))
  );
drop policy if exists "teammates update review notes" on short_video_comments;
create policy "teammates update review notes" on short_video_comments for update to authenticated
  using (short_id in (select my_short_ids()))
  with check (short_id in (select my_short_ids()));
drop policy if exists "authors and masters delete review notes" on short_video_comments;
create policy "authors and masters delete review notes" on short_video_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from short_videos s where s.id = short_id and is_team_master(s.team_id))
  );

do $$ begin
  alter publication supabase_realtime add table short_video_comments;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 4. Short: approved version, keep switch, review gate
-- ---------------------------------------------------------------------------

alter table short_videos
  add column if not exists approved_version_id uuid references short_video_versions(id) on delete set null,
  add column if not exists keep_media boolean not null default false;
create index if not exists short_videos_approved_version_idx on short_videos (approved_version_id);

-- Editing → In review needs a video: an uploaded version (or, while we
-- switch over, a Frame.io link). Approving locks in the latest version.
create or replace function short_review_gate()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.stage = 'editing' and new.stage = 'review'
     and not exists (select 1 from short_video_versions where short_id = new.id and deleted_at is null)
     and not is_frameio_link(new.file_link) then
    raise exception 'Upload the video first.' using errcode = '23514';
  end if;
  if old.stage = 'review' and new.stage = 'ready' then
    new.approved_version_id := (
      select id from short_video_versions
       where short_id = new.id and deleted_at is null
       order by version_number desc limit 1
    );
  end if;
  if new.approved_version_id is distinct from old.approved_version_id
     and not (old.stage = 'review' and new.stage = 'ready')
     and current_setting('vp.short_system', true) is distinct from 'on'
     and auth.uid() is not null then
    new.approved_version_id := old.approved_version_id;
  end if;
  return new;
end;
$$;
drop trigger if exists short_review_gate on short_videos;
create trigger short_review_gate
  before update on short_videos
  for each row execute procedure short_review_gate();

-- The old gate (0031) only accepted Frame.io; the new trigger above decides.
create or replace function is_frameio_link(p_link text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_link ~* '^https://([a-z0-9-]+\.)*(frame\.io|f\.io)/\S+$', false);
$$;

grant update (keep_media) on short_videos to authenticated;


-- ---------------------------------------------------------------------------
-- 5. Short guard: the review gate above replaces the Frame.io-only check;
--    keep_media is master/scheduler; approved_version_id is set by the
--    database only.
-- ---------------------------------------------------------------------------

create or replace function short_guard_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_system boolean := current_setting('vp.short_system', true) = 'on';
  v_master boolean;
  v_scheduler boolean;
  v_editor boolean;
  v_reviewer boolean;
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  if auth.uid() is null or v_system then
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.entry_number is distinct from old.entry_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.queue_position is distinct from old.queue_position then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  if new.approved_version_id is distinct from old.approved_version_id
     and not (old.stage = 'review' and new.stage = 'ready') then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;

  if old.stage = 'posted' and new.stage is distinct from old.stage then
    raise exception 'This short is posted and locked. Un-mark a platform to reopen it.' using errcode = '42501';
  end if;

  -- (Editing → In review needing a video is checked by short_review_gate.)

  if new.planned_date is distinct from old.planned_date then
    new.schedule_mode := case when new.planned_date is null then 'auto' else 'pinned' end;
  end if;
  if new.schedule_mode = 'auto' then
    if old.schedule_mode = 'pinned' then
      new.planned_date := null;
    end if;
    new.pin_kind := null;
  else
    new.pin_kind := coalesce(
      new.pin_kind, old.pin_kind,
      case when is_team_master(old.team_id) and (active_queue_start(old.team_id, old.id)).id is null then 'anchor' else 'oneoff' end
    );
    if old.schedule_mode <> 'pinned'
       or new.planned_date is distinct from old.planned_date
       or new.pin_kind is distinct from old.pin_kind then
      new.queue_position := short_position_for_date(new.team_id, new.planned_date, new.id);
    end if;
  end if;

  v_master := is_team_master(old.team_id);
  if v_master then
    return new;
  end if;

  v_scheduler := has_team_role(old.team_id, 'publisher');
  v_editor := exists (
    select 1 from team_members where id = old.editor_member_id and user_id = auth.uid() and status = 'active'
  );
  v_reviewer := exists (
    select 1 from team_members where id = old.reviewer_member_id and user_id = auth.uid() and status = 'active'
  );

  if new.stage is distinct from old.stage and not (
       (v_editor and old.stage = 'editing' and new.stage = 'review')
    or (v_reviewer and old.stage = 'review' and new.stage in ('ready', 'editing'))
  ) then
    raise exception 'You can''t move this short to that stage.' using errcode = '42501';
  end if;

  if new.review_note is distinct from old.review_note
     and not (v_reviewer and old.stage = 'review' and new.stage is distinct from old.stage) then
    raise exception 'Only the reviewer can leave review notes.' using errcode = '42501';
  end if;

  if (new.editor_member_id is distinct from old.editor_member_id
      or new.reviewer_member_id is distinct from old.reviewer_member_id
      or new.scheduler_member_id is distinct from old.scheduler_member_id)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change who works on a short.' using errcode = '42501';
  end if;

  -- Fixed dates and the queue start belong to the master.
  if old.schedule_mode = 'pinned'
     and (new.planned_date is distinct from old.planned_date
          or new.schedule_mode is distinct from old.schedule_mode
          or new.pin_kind is distinct from old.pin_kind) then
    raise exception 'Only the master can change a fixed date.' using errcode = '42501';
  end if;
  if new.pin_kind = 'anchor' and new.pin_kind is distinct from old.pin_kind then
    raise exception 'Only the master can start the queue.' using errcode = '42501';
  end if;

  -- Title, type, platforms and dates of Auto shorts: master or scheduler.
  if (new.title is distinct from old.title
      or new.planned_date is distinct from old.planned_date
      or new.schedule_mode is distinct from old.schedule_mode
      or new.pin_kind is distinct from old.pin_kind
      or new.platforms is distinct from old.platforms
      or new.short_type is distinct from old.short_type)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;

  if (new.caption is distinct from old.caption or new.caption_enabled is distinct from old.caption_enabled)
     and not v_scheduler then
    raise exception 'Only the master or a scheduler can change the caption.' using errcode = '42501';
  end if;

  if new.keep_media is distinct from old.keep_media and not v_scheduler then
    raise exception 'Only the master or a scheduler can change that.' using errcode = '42501';
  end if;

  if new.file_link is distinct from old.file_link
     and not (v_editor or v_scheduler) then
    raise exception 'Only the master, its editor or a scheduler can set the final file.' using errcode = '42501';
  end if;

  return new;
end;
$$;
