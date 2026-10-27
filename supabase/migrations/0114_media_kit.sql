-- ============================================================================
-- 0114: the media kit (1.37.0)
--
-- Analytics → Media kit makes a PDF deck of the team's numbers for sponsors
-- (followers, views, engagement, audience, best videos, rates, contact). What
-- the team sets up for it is kept here, one row per team, so the next kit
-- starts where the last one left off.
--
--   * media_kit_settings: the team's setup (a JSON object, at most 100 KB;
--     the app checks every field). Read by the people who see revenue (Masters
--     and those given access in Analytics → Revenue: the rates are money);
--     written by Masters. updated_at / updated_by kept by the database.
--   * Storage "media-kit" (private, pictures only, 5 MB): the cover photo,
--     "<team id>/<file>". Read by the same people, added, replaced and
--     removed by Masters. The app signs a link for an hour to draw it.
--
-- supabase/tests/media-kit.test.sql checks it. Additive; safe to run twice.
-- Staging first, then production.
-- ============================================================================

create table if not exists media_kit_settings (
  team_id uuid primary key references teams(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null default auth.uid()
);
create index if not exists media_kit_settings_updated_by_idx on media_kit_settings (updated_by);

alter table media_kit_settings enable row level security;
revoke all on media_kit_settings from anon, authenticated;
grant select, insert, update on media_kit_settings to authenticated;

drop policy if exists "revenue people read the media kit" on media_kit_settings;
create policy "revenue people read the media kit" on media_kit_settings for select to authenticated
  using (team_id in (select revenue_team_ids()));
drop policy if exists "masters start the media kit" on media_kit_settings;
create policy "masters start the media kit" on media_kit_settings for insert to authenticated
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters change the media kit" on media_kit_settings;
create policy "masters change the media kit" on media_kit_settings for update to authenticated
  using (team_id in (select my_master_team_ids()))
  with check (team_id in (select my_master_team_ids()));

-- When and by whom: the database's, whatever the app sends.
create or replace function media_kit_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function media_kit_touch() from public, anon, authenticated;
drop trigger if exists media_kit_touch on media_kit_settings;
create trigger media_kit_touch before insert or update on media_kit_settings
  for each row execute procedure media_kit_touch();

-- The cover photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media-kit', 'media-kit', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media kit: revenue people read" on storage.objects;
create policy "media kit: revenue people read" on storage.objects for select to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from revenue_team_ids() t));
drop policy if exists "media kit: masters add" on storage.objects;
create policy "media kit: masters add" on storage.objects for insert to authenticated
  with check (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from my_master_team_ids() t));
drop policy if exists "media kit: masters replace" on storage.objects;
create policy "media kit: masters replace" on storage.objects for update to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from my_master_team_ids() t))
  with check (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from my_master_team_ids() t));
drop policy if exists "media kit: masters remove" on storage.objects;
create policy "media kit: masters remove" on storage.objects for delete to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from my_master_team_ids() t));
