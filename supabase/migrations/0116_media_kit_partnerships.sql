-- ============================================================================
-- 0116: the media kit is for Masters and Partnerships (1.39.0).
--
-- Until now (0114) the people who see revenue read it (Masters and those given
-- revenue access) and Masters wrote it. Now, as the owner asked, it's the
-- team's Masters and the people with the Partnerships role (0115): both read
-- it, start it and change it, and both add, replace and remove its cover
-- photo. Revenue access alone no longer opens it.
--
--   * media_kit_team_ids(): the teams where you're an active Master or have
--     Partnerships (security definer, asked once per query, like 0109's).
--   * media_kit_settings: its three rules, through it.
--   * Storage "media-kit": its four rules, through it.
--
-- supabase/tests/media-kit.test.sql checks it. Additive; safe to run twice.
-- Run after 0115. Staging first, then production.
-- ============================================================================

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
   where tm.user_id = auth.uid() and tm.status = 'active' and mr.role in ('master', 'partnerships')
$$;
revoke all on function media_kit_team_ids() from public, anon;
grant execute on function media_kit_team_ids() to authenticated, service_role;

-- The setup.
drop policy if exists "revenue people read the media kit" on media_kit_settings;
drop policy if exists "masters start the media kit" on media_kit_settings;
drop policy if exists "masters change the media kit" on media_kit_settings;
drop policy if exists "media kit people read it" on media_kit_settings;
drop policy if exists "media kit people start it" on media_kit_settings;
drop policy if exists "media kit people change it" on media_kit_settings;
create policy "media kit people read it" on media_kit_settings for select to authenticated
  using (team_id in (select media_kit_team_ids()));
create policy "media kit people start it" on media_kit_settings for insert to authenticated
  with check (team_id in (select media_kit_team_ids()));
create policy "media kit people change it" on media_kit_settings for update to authenticated
  using (team_id in (select media_kit_team_ids()))
  with check (team_id in (select media_kit_team_ids()));

-- The cover photo, "<team id>/<file>".
drop policy if exists "media kit: revenue people read" on storage.objects;
drop policy if exists "media kit: masters add" on storage.objects;
drop policy if exists "media kit: masters replace" on storage.objects;
drop policy if exists "media kit: masters remove" on storage.objects;
drop policy if exists "media kit: its people read" on storage.objects;
drop policy if exists "media kit: its people add" on storage.objects;
drop policy if exists "media kit: its people replace" on storage.objects;
drop policy if exists "media kit: its people remove" on storage.objects;
create policy "media kit: its people read" on storage.objects for select to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from media_kit_team_ids() t));
create policy "media kit: its people add" on storage.objects for insert to authenticated
  with check (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from media_kit_team_ids() t));
create policy "media kit: its people replace" on storage.objects for update to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from media_kit_team_ids() t))
  with check (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from media_kit_team_ids() t));
create policy "media kit: its people remove" on storage.objects for delete to authenticated
  using (bucket_id = 'media-kit' and (storage.foldername(name))[1] in (select t::text from media_kit_team_ids() t));
