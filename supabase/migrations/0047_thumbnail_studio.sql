-- ============================================================================
-- 0047: Thumbnail Studio
--
--   * package_entries (already existed, unused): each row is one variation
--     of the video's packaging: a thumbnail + its own title. Now with
--     position, image size, and one "winner" per video.
--     Images live in the PRIVATE bucket "package-thumbs" under
--     <team>/<project>/<file>. Teammates see; packagers + masters edit.
--   * mockup_videos: the team's placeholder library for the fake YouTube
--     page (popular videos imported on demand). Stored in the PRIVATE
--     bucket "mockup-library" so previews load instantly. Only the server
--     writes it (during an import); teammates read.
-- Staging first, then production.
-- ============================================================================

alter table package_entries
  add column if not exists position double precision not null default 0,
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists size_bytes bigint,
  add column if not exists is_winner boolean not null default false,
  add column if not exists created_by uuid references profiles(id) on delete set null;
create index if not exists package_entries_project_idx on package_entries (project_id, position);
create index if not exists package_entries_created_by_idx on package_entries (created_by);
alter table package_entries drop constraint if exists package_entries_title_length;
alter table package_entries add constraint package_entries_title_length check (char_length(title) <= 100);
-- One winner per video.
create unique index if not exists package_entries_one_winner on package_entries (project_id) where is_winner;

-- Thumbnails must sit in the project's own folder.
create or replace function package_entries_check()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from long_video_projects where id = new.project_id;
  if new.thumbnail_storage_path is not null
     and (split_part(new.thumbnail_storage_path, '/', 1) <> v_team::text
          or split_part(new.thumbnail_storage_path, '/', 2) <> new.project_id::text) then
    raise exception 'That image isn''t in this video''s folder.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.position = 0 then
      new.position := coalesce((select max(position) from package_entries where project_id = new.project_id), 0) + 1;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists package_entries_check on package_entries;
create trigger package_entries_check before insert or update on package_entries
  for each row execute procedure package_entries_check();

-- Packagers and masters may also edit and delete (insert existed).
drop policy if exists "package-access edits entries" on package_entries;
create policy "package-access edits entries" on package_entries for update to authenticated
  using (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))))
  with check (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))));
drop policy if exists "package-access deletes entries" on package_entries;
create policy "package-access deletes entries" on package_entries for delete to authenticated
  using (exists (select 1 from long_video_projects p where p.id = project_id and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))));

-- Pick the winner (clears the old one in the same step).
create or replace function set_package_winner(p_entry uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_project uuid;
  v_team uuid;
begin
  select e.project_id, p.team_id into v_project, v_team
    from package_entries e join long_video_projects p on p.id = e.project_id where e.id = p_entry;
  if v_project is null or v_team not in (select my_team_ids()) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if not (is_team_master(v_team) or has_team_role(v_team, 'packager')) then
    raise exception 'Only the master or a packager can pick the winner.' using errcode = '42501';
  end if;
  update package_entries set is_winner = false where project_id = v_project and is_winner and id <> p_entry;
  update package_entries set is_winner = true where id = p_entry;
end;
$$;
grant execute on function set_package_winner(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Storage: package thumbnails (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('package-thumbs', 'package-thumbs', false)
on conflict (id) do update set public = false;

drop policy if exists "teammates read package thumbs" on storage.objects;
create policy "teammates read package thumbs" on storage.objects for select to authenticated
  using (bucket_id = 'package-thumbs' and ((storage.foldername(name))[1])::uuid in (select my_team_ids()));

drop policy if exists "package-access uploads thumbs" on storage.objects;
create policy "package-access uploads thumbs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'package-thumbs'
    and exists (
      select 1 from long_video_projects p
       where p.id::text = (storage.foldername(name))[2]
         and p.team_id::text = (storage.foldername(name))[1]
         and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))
    )
  );

drop policy if exists "package-access deletes thumbs" on storage.objects;
create policy "package-access deletes thumbs" on storage.objects for delete to authenticated
  using (
    bucket_id = 'package-thumbs'
    and exists (
      select 1 from long_video_projects p
       where p.id::text = (storage.foldername(name))[2]
         and p.team_id::text = (storage.foldername(name))[1]
         and (is_team_master(p.team_id) or has_team_role(p.team_id, 'packager'))
    )
  );


-- ---------------------------------------------------------------------------
-- The placeholder library
-- ---------------------------------------------------------------------------

create table if not exists mockup_videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  youtube_id text not null,
  title text not null,
  channel text not null,
  channel_avatar_path text,
  thumb_path text not null,
  views bigint,
  published_at timestamptz,
  duration_sec int,
  category text,
  region text,
  imported_at timestamptz not null default now(),
  unique (team_id, youtube_id)
);
create index if not exists mockup_videos_team_idx on mockup_videos (team_id);
alter table mockup_videos enable row level security;
revoke all on mockup_videos from anon, authenticated;
grant select on mockup_videos to authenticated;
drop policy if exists "teammates read the library" on mockup_videos;
create policy "teammates read the library" on mockup_videos for select to authenticated
  using (team_id in (select my_team_ids()));

insert into storage.buckets (id, name, public) values ('mockup-library', 'mockup-library', false)
on conflict (id) do update set public = false;
drop policy if exists "teammates read the library images" on storage.objects;
create policy "teammates read the library images" on storage.objects for select to authenticated
  using (bucket_id = 'mockup-library' and ((storage.foldername(name))[1])::uuid in (select my_team_ids()));
