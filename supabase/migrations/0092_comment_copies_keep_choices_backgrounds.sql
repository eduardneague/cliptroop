-- ============================================================================
-- 0092: 1.27.5
--
--   * Comments and editing ideas go with their script (script_copy_comments):
--     "Ready for review / staging" copies them when it copies the text, and
--     "Copy from…" when you say so. Each copy keeps its author, its date and
--     whether it was resolved; its drawing was copied by the server into the
--     new document's folder first (p_items says which ones). Only within one
--     video, by people who may comment on the document it goes to (0072);
--     ones already there aren't copied twice. The insert trigger (0056) keeps
--     the author and dates only for these copies (a setting this function
--     turns on for its own transaction).
--   * How long files stay after posting (Team → Defaults → Video files):
--     the same choices for shorts' video files (media_keep_days), long
--     videos' edits (long_media_keep_days) and Thumbnail Studio's thumbnails
--     that didn't win (studio_keep_days): 1, 3 days, 1, 2, 3 weeks, 1, 2, 3, 6
--     months or 1 year, or never (null: the nightly clean-up leaves them).
--     Today's choices stay as they are.
--   * The glass look (profiles.glass_ui, off by default) and a background
--     for your own dashboard (a picture, a GIF or a short video in the
--     public "dashboard-backgrounds" bucket, in your own folder, 25 MB at
--     most; shown only when dashboard_bg_on, darkened by dashboard_bg_dim %).
--     Each person changes only their own.
--
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

-- Comments copied with their document ------------------------------------------

create or replace function script_comments_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from scripts where id = new.script_id;
    -- A copy (script_copy_comments, 1.27.5) keeps who wrote it and when; anything else is the writer's, now.
    if coalesce(current_setting('vp.copying_comments', true), '') <> 'on' then
      new.author_id := auth.uid();
      new.created_at := now();
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  else
    if new.quote is distinct from old.quote or new.occurrence is distinct from old.occurrence
       or new.script_id is distinct from old.script_id or new.team_id is distinct from old.team_id then
      raise exception 'A comment''s place in the document can''t be changed.' using errcode = '42501';
    end if;
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at
       or ((new.body is distinct from old.body
            or new.sketch_path is distinct from old.sketch_path
            or new.sketch_w is distinct from old.sketch_w
            or new.sketch_h is distinct from old.sketch_h
            or new.kind is distinct from old.kind)
           and old.author_id is distinct from auth.uid()) then
      raise exception 'Only resolving can change someone else''s comment.' using errcode = '42501';
    end if;
    if new.resolved_at is distinct from old.resolved_at then
      new.resolved_at := case when new.resolved_at is null then null else now() end;
      new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
    end if;
  end if;
  if new.sketch_path is not null
     and new.sketch_path not like (new.team_id::text || '/' || new.script_id::text || '/%.png') then
    raise exception 'That drawing doesn''t belong to this document.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists script_comments_write on script_comments;
create trigger script_comments_write before insert or update on script_comments
  for each row execute procedure script_comments_write();

-- p_items: [{ id: the comment, new_id: its copy's id, sketch: its drawing was copied to <team>/<to>/<new_id>.png }].
-- Comments not in p_items are copied too, without their drawing. Returns the new ids.
create or replace function script_copy_comments(p_from uuid, p_to uuid, p_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  a scripts%rowtype;
  b scripts%rowtype;
  v_ids uuid[];
begin
  select * into a from scripts where id = p_from;
  select * into b from scripts where id = p_to;
  if a.id is null or b.id is null or a.id = b.id
     or a.team_id not in (select my_team_ids())
     or b.team_id is distinct from a.team_id
     or coalesce(a.short_video_id, a.long_video_id) is distinct from coalesce(b.short_video_id, b.long_video_id) then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  if not can_comment_script(b.id) then
    raise exception 'Only this video''s scripters and its Review and Staging people can comment on its script.' using errcode = '42501';
  end if;

  perform set_config('vp.copying_comments', 'on', true);
  with items as (
    select distinct on ((x->>'id')::uuid)
           (x->>'id')::uuid as id,
           (x->>'new_id')::uuid as new_id,
           coalesce((x->>'sketch')::boolean, false) as sketch
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) as x
     where coalesce(x->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and coalesce(x->>'new_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), copied as (
    insert into script_comments (id, script_id, team_id, quote, occurrence, body, kind, author_id, created_at, resolved_at, resolved_by, sketch_path, sketch_w, sketch_h)
    select coalesce(i.new_id, gen_random_uuid()),
           b.id,
           b.team_id,
           c.quote,
           c.occurrence,
           c.body,
           c.kind,
           c.author_id,
           c.created_at,
           c.resolved_at,
           c.resolved_by,
           case when i.sketch and c.sketch_path is not null then b.team_id::text || '/' || b.id::text || '/' || i.new_id::text || '.png' end,
           case when i.sketch and c.sketch_path is not null then c.sketch_w end,
           case when i.sketch and c.sketch_path is not null then c.sketch_h end
      from script_comments c
      left join items i on i.id = c.id
     where c.script_id = a.id
       and not exists (
         select 1
           from script_comments x
          where x.script_id = b.id
            and x.quote = c.quote
            and x.occurrence = c.occurrence
            and x.kind = c.kind
            and x.body = c.body
            and x.author_id is not distinct from c.author_id
       )
       -- (A new id that's taken already: that one isn't copied.)
       and not exists (select 1 from script_comments y where y.id = i.new_id)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from copied;
  perform set_config('vp.copying_comments', 'off', true);
  return to_jsonb(v_ids);
end;
$$;
revoke all on function script_copy_comments(uuid, uuid, jsonb) from public, anon;
grant execute on function script_copy_comments(uuid, uuid, jsonb) to authenticated;

-- How long files stay after posting: 1 day to 1 year, or never ------------------

alter table teams alter column media_keep_days drop not null;
alter table teams drop constraint if exists teams_media_keep_days_check;
alter table teams add constraint teams_media_keep_days_check
  check (media_keep_days is null or media_keep_days in (1, 3, 7, 14, 21, 30, 60, 90, 180, 365));

alter table teams alter column long_media_keep_days drop not null;
alter table teams drop constraint if exists teams_long_media_keep_days_check;
alter table teams add constraint teams_long_media_keep_days_check
  check (long_media_keep_days is null or long_media_keep_days in (1, 3, 7, 14, 21, 30, 60, 90, 180, 365));

alter table teams drop constraint if exists teams_studio_keep_days_check;
alter table teams add constraint teams_studio_keep_days_check
  check (studio_keep_days is null or studio_keep_days in (1, 3, 7, 14, 21, 30, 60, 90, 180, 365));

-- The glass look and a dashboard background, per person ------------------------

alter table profiles add column if not exists glass_ui boolean not null default false;
alter table profiles add column if not exists dashboard_bg_path text;
alter table profiles add column if not exists dashboard_bg_on boolean not null default false;
alter table profiles add column if not exists dashboard_bg_dim smallint not null default 30;
do $$
begin
  -- Only a file in your own folder: "<your id>/<name>.<picture or video>".
  if not exists (select 1 from pg_constraint where conname = 'profiles_dashboard_bg_path_check') then
    alter table profiles add constraint profiles_dashboard_bg_path_check check (
      dashboard_bg_path is null
      or (split_part(dashboard_bg_path, '/', 1) = id::text
          and dashboard_bg_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}\.(jpe?g|png|webp|avif|gif|mp4|webm)$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_dashboard_bg_dim_check') then
    alter table profiles add constraint profiles_dashboard_bg_dim_check check (dashboard_bg_dim between 0 and 80);
  end if;
end;
$$;
grant update (glass_ui, dashboard_bg_path, dashboard_bg_on, dashboard_bg_dim) on profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dashboard-backgrounds', 'dashboard-backgrounds', true, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Your own folder only ("<your id>/…"); anyone may look at a file (it's your dashboard's picture, like an avatar).
drop policy if exists "dashboard backgrounds: add to your folder" on storage.objects;
create policy "dashboard backgrounds: add to your folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dashboard-backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "dashboard backgrounds: replace in your folder" on storage.objects;
create policy "dashboard backgrounds: replace in your folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'dashboard-backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "dashboard backgrounds: remove from your folder" on storage.objects;
create policy "dashboard backgrounds: remove from your folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dashboard-backgrounds' and (storage.foldername(name))[1] = (select auth.uid())::text);

