-- 0133 (1.54.0): Frame Guides. The owner (Nov 18 2026): "I want a page called Frame Guides ... A guide frame is an
-- example of how we can shoot a frame for a certain video ... it will get a number automatically, a screenshot of the
-- example of the frame ... keywords ... categories ... the ability to add custom categories ... in scripting ... another
-- option to add a frame guide ... the goal is to just have an idea of what the shot will look like so we will use
-- references from other youtubers from the collections / groups that we can create ourselves."
--
--   * frame_collections: a team's groups of guide frames (a name, a colour, a line about it).
--   * frame_guides: one guide frame. Its number is the team's next one (#1, #2, …; never reused, never changed). Its
--     picture is in the public "frame-guides" bucket in its own folder, <team>/<frame>/… (random names, like a
--     script's pictures): a full one and a small one for the grids. A collection, a title, keywords (lowercase, once
--     each), categories (the app's own by key, like "close-up", or the team's own as "c:<its id>"), who made the shot,
--     a link to where it's from, notes, its size and a tint (shown while the picture loads).
--   * frame_categories: a team's own categories. Deleting one takes it off every frame.
--   * Who: everyone on the team sees them, adds them and changes them (a shared library); whoever added one, or a
--     master, deletes it. The pictures go up through links the app signs after checking that (no storage rule lets
--     anyone write there directly); deleting a frame deletes its pictures (the app, with the service key).
--   * script_comments: a third kind, 'frame' (a frame guide on words of a script, like a comment or an editing idea),
--     with frame_id (it stays, as "deleted", if the frame goes) and words of its own optional. script_comments_write()
--     is 0127's plus: the frame is the script's team's, and only its author changes which one. script_copy_comments()
--     is 0092's plus frame_id.
--   * storage_team_of() / team_storage_usage() (0124) know the new bucket (a team's own folder).
--   * frame_guides_ready(): App setup's check.
-- Additive; safe to run twice.

-- ---------------------------------------------------------------------------
-- A frame's categories: the app's own keys, or the team's own (c:<uuid>)
-- ---------------------------------------------------------------------------
create or replace function public.frame_category_keys_ok(p text[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(p), 0) <= 30
     and not exists (
       select 1 from unnest(coalesce(p, '{}'::text[])) as k
        where k is null
           or k !~ '^([a-z0-9]+(-[a-z0-9]+)*|c:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
           or char_length(k) > 40
     );
$$;
revoke all on function public.frame_category_keys_ok(text[]) from public, anon;
grant execute on function public.frame_category_keys_ok(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create table if not exists public.frame_collections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  color text not null default 'teal',
  about text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frame_collections_name_ok check (char_length(btrim(name)) between 1 and 60),
  constraint frame_collections_color_ok check (color in ('teal', 'blue', 'violet', 'pink', 'red', 'orange', 'amber', 'green', 'slate')),
  constraint frame_collections_about_ok check (char_length(about) <= 300)
);
create unique index if not exists frame_collections_name_key on public.frame_collections (team_id, lower(btrim(name)));
create index if not exists frame_collections_created_by_idx on public.frame_collections (created_by);

create or replace function public.frame_collections_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.about := btrim(coalesce(new.about, ''));
  if tg_op = 'INSERT' then
    if (select count(*) from frame_collections where team_id = new.team_id) >= 200 then
      raise exception 'A team can have 200 collections.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id then
      raise exception 'A collection stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.frame_collections_write() from public, anon, authenticated;
drop trigger if exists frame_collections_write on public.frame_collections;
create trigger frame_collections_write before insert or update on public.frame_collections
  for each row execute procedure public.frame_collections_write();

alter table public.frame_collections enable row level security;
drop policy if exists "frame collections: the team sees" on public.frame_collections;
create policy "frame collections: the team sees" on public.frame_collections for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "frame collections: the team adds" on public.frame_collections;
create policy "frame collections: the team adds" on public.frame_collections for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame collections: the team changes" on public.frame_collections;
create policy "frame collections: the team changes" on public.frame_collections for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame collections: its maker or a master deletes" on public.frame_collections;
create policy "frame collections: its maker or a master deletes" on public.frame_collections for delete to authenticated
  using (team_id in (select my_team_ids()) and (created_by = (select auth.uid()) or is_team_master(team_id)));

-- ---------------------------------------------------------------------------
-- The team's own categories
-- ---------------------------------------------------------------------------
create table if not exists public.frame_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  color text not null default 'slate',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint frame_categories_name_ok check (char_length(btrim(name)) between 1 and 40),
  constraint frame_categories_color_ok check (color in ('teal', 'blue', 'violet', 'pink', 'red', 'orange', 'amber', 'green', 'slate'))
);
create unique index if not exists frame_categories_name_key on public.frame_categories (team_id, lower(btrim(name)));
create index if not exists frame_categories_created_by_idx on public.frame_categories (created_by);

create or replace function public.frame_categories_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if (select count(*) from frame_categories where team_id = new.team_id) >= 100 then
      raise exception 'A team can have 100 categories of its own.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id then
      raise exception 'A category stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.frame_categories_write() from public, anon, authenticated;
drop trigger if exists frame_categories_write on public.frame_categories;
create trigger frame_categories_write before insert or update on public.frame_categories
  for each row execute procedure public.frame_categories_write();

alter table public.frame_categories enable row level security;
drop policy if exists "frame categories: the team sees" on public.frame_categories;
create policy "frame categories: the team sees" on public.frame_categories for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "frame categories: the team adds" on public.frame_categories;
create policy "frame categories: the team adds" on public.frame_categories for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame categories: the team changes" on public.frame_categories;
create policy "frame categories: the team changes" on public.frame_categories for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame categories: its maker or a master deletes" on public.frame_categories;
create policy "frame categories: its maker or a master deletes" on public.frame_categories for delete to authenticated
  using (team_id in (select my_team_ids()) and (created_by = (select auth.uid()) or is_team_master(team_id)));

-- ---------------------------------------------------------------------------
-- The guide frames
-- ---------------------------------------------------------------------------
create table if not exists public.frame_guides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  collection_id uuid not null references public.frame_collections(id) on delete cascade,
  number int not null,
  title text not null default '',
  notes text not null default '',
  creator text not null default '',
  source_url text,
  keywords text[] not null default '{}',
  categories text[] not null default '{}',
  image_path text not null,
  thumb_path text,
  width int not null default 1920,
  height int not null default 1080,
  tint text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frame_guides_number_key unique (team_id, number),
  constraint frame_guides_title_ok check (char_length(title) <= 120),
  constraint frame_guides_notes_ok check (char_length(notes) <= 2000),
  constraint frame_guides_creator_ok check (char_length(creator) <= 80),
  constraint frame_guides_source_ok check (source_url is null or (source_url ~* '^https?://[^\s]+$' and char_length(source_url) <= 1000)),
  constraint frame_guides_keywords_ok check (cardinality(keywords) <= 30 and char_length(array_to_string(keywords, '|')) <= 800),
  constraint frame_guides_categories_ok check (public.frame_category_keys_ok(categories)),
  constraint frame_guides_paths_ok check (char_length(image_path) <= 300 and char_length(coalesce(thumb_path, '')) <= 300),
  constraint frame_guides_size_ok check (width between 1 and 20000 and height between 1 and 20000),
  constraint frame_guides_tint_ok check (tint is null or tint ~ '^#[0-9a-f]{6}$')
);
create index if not exists frame_guides_collection_idx on public.frame_guides (collection_id);
create index if not exists frame_guides_created_by_idx on public.frame_guides (created_by);

create or replace function public.frame_guides_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_folder text;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from frame_guides where team_id = new.team_id) >= 5000 then
      raise exception 'A team can keep 5,000 frame guides.' using errcode = 'check_violation';
    end if;
    -- The team's next number, whatever was sent.
    new.number := next_team_number(new.team_id, 'frame_guide');
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id or new.number is distinct from old.number then
      raise exception 'A frame guide keeps its team and its number.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  -- Its collection is its team's.
  if not exists (select 1 from frame_collections c where c.id = new.collection_id and c.team_id = new.team_id) then
    raise exception 'That collection isn''t this team''s.' using errcode = '42501';
  end if;
  -- Its pictures are in its own folder: <team>/<frame>/…
  v_folder := new.team_id::text || '/' || new.id::text || '/';
  if left(new.image_path, length(v_folder)) <> v_folder
     or (new.thumb_path is not null and left(new.thumb_path, length(v_folder)) <> v_folder)
     or position('..' in new.image_path) > 0
     or position('..' in coalesce(new.thumb_path, '')) > 0 then
    raise exception 'That picture doesn''t belong to this frame guide.' using errcode = '42501';
  end if;
  -- Keywords: lowercase, trimmed, once each, in the order given.
  new.keywords := coalesce((
    select array_agg(s.k order by s.o)
      from (
        select lower(btrim(t.k)) as k, min(t.o) as o
          from unnest(coalesce(new.keywords, '{}'::text[])) with ordinality as t(k, o)
         where btrim(coalesce(t.k, '')) <> ''
         group by 1
      ) s
  ), '{}'::text[]);
  -- Categories once each; the team's own ones must be the team's.
  new.categories := coalesce((
    select array_agg(s.k order by s.o)
      from (
        select t.k, min(t.o) as o
          from unnest(coalesce(new.categories, '{}'::text[])) with ordinality as t(k, o)
         where t.k is not null
         group by t.k
      ) s
  ), '{}'::text[]);
  if exists (
    select 1
      from unnest(new.categories) as k
     where k like 'c:%'
       and not exists (select 1 from frame_categories fc where fc.team_id = new.team_id and 'c:' || fc.id::text = k)
  ) then
    raise exception 'One of those categories isn''t this team''s.' using errcode = '42501';
  end if;
  new.title := btrim(coalesce(new.title, ''));
  new.creator := btrim(coalesce(new.creator, ''));
  new.notes := coalesce(new.notes, '');
  new.source_url := nullif(btrim(coalesce(new.source_url, '')), '');
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.frame_guides_write() from public, anon, authenticated;
drop trigger if exists frame_guides_write on public.frame_guides;
create trigger frame_guides_write before insert or update on public.frame_guides
  for each row execute procedure public.frame_guides_write();

-- A category that goes is taken off every frame.
create or replace function public.frame_categories_gone()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update frame_guides
     set categories = array_remove(categories, 'c:' || old.id::text)
   where team_id = old.team_id
     and categories @> array['c:' || old.id::text];
  return old;
end;
$$;
revoke all on function public.frame_categories_gone() from public, anon, authenticated;
drop trigger if exists frame_categories_gone on public.frame_categories;
create trigger frame_categories_gone after delete on public.frame_categories
  for each row execute procedure public.frame_categories_gone();

alter table public.frame_guides enable row level security;
drop policy if exists "frame guides: the team sees" on public.frame_guides;
create policy "frame guides: the team sees" on public.frame_guides for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "frame guides: the team adds" on public.frame_guides;
create policy "frame guides: the team adds" on public.frame_guides for insert to authenticated
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame guides: the team changes" on public.frame_guides;
create policy "frame guides: the team changes" on public.frame_guides for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
drop policy if exists "frame guides: its maker or a master deletes" on public.frame_guides;
create policy "frame guides: its maker or a master deletes" on public.frame_guides for delete to authenticated
  using (team_id in (select my_team_ids()) and (created_by = (select auth.uid()) or is_team_master(team_id)));

-- Two-step sign-in (0125) holds on the new tables too: nothing until the second step.
do $$
declare
  t text;
begin
  foreach t in array array['frame_collections', 'frame_categories', 'frame_guides'] loop
    execute format('drop policy if exists "two-step sign-in" on public.%I', t);
    execute format(
      'create policy "two-step sign-in" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The pictures: public (random names), pictures only, 5 MB at most
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frame-guides', 'frame-guides', true, 5242880,
        array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Frame guides on a script's words: the comments' third kind
-- ---------------------------------------------------------------------------
alter table script_comments add column if not exists frame_id uuid references public.frame_guides(id) on delete set null;
create index if not exists script_comments_frame_idx on script_comments (frame_id) where frame_id is not null;

alter table script_comments drop constraint if exists script_comments_kind_check;
alter table script_comments add constraint script_comments_kind_check check (kind in ('comment', 'edit_idea', 'frame'));
-- A frame guide may come without words of its own (the frame says it).
alter table script_comments drop constraint if exists script_comments_body_check;
alter table script_comments add constraint script_comments_body_check
  check (char_length(body) <= 2000 and (kind = 'frame' or char_length(btrim(body)) >= 1));

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
      -- 1.54.0: a new frame guide on words has its frame.
      if new.kind = 'frame' and new.frame_id is null then
        raise exception 'Pick a frame guide first.' using errcode = 'check_violation';
      end if;
    end if;
    new.edited_at := null;
  else
    if new.quote is distinct from old.quote or new.occurrence is distinct from old.occurrence
       or new.script_id is distinct from old.script_id or new.team_id is distinct from old.team_id then
      raise exception 'A comment''s place in the document can''t be changed.' using errcode = '42501';
    end if;
    -- (A frame that's deleted leaves its frame guides on words without one: that's the database's own change.)
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at
       or ((new.body is distinct from old.body
            or new.sketch_path is distinct from old.sketch_path
            or new.sketch_w is distinct from old.sketch_w
            or new.sketch_h is distinct from old.sketch_h
            or new.kind is distinct from old.kind
            or (new.frame_id is distinct from old.frame_id and new.frame_id is not null))
           and old.author_id is distinct from auth.uid()) then
      raise exception 'Only resolving can change someone else''s comment.' using errcode = '42501';
    end if;
    if new.resolved_at is distinct from old.resolved_at then
      new.resolved_at := case when new.resolved_at is null then null else now() end;
      new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
    end if;
    -- 1.50.0: "edited" means the author changed the words, and only that.
    new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
  end if;
  -- 1.54.0: only a frame guide has a frame, and it's the team's.
  if new.kind is distinct from 'frame' then
    new.frame_id := null;
  elsif new.frame_id is not null
        and (tg_op = 'INSERT' or new.frame_id is distinct from old.frame_id)
        and not exists (select 1 from frame_guides f where f.id = new.frame_id and f.team_id = new.team_id) then
    raise exception 'That frame guide isn''t this team''s.' using errcode = '42501';
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

-- 0092's, with the frame coming along. p_items: [{ id: the comment, new_id: its copy's id, sketch: its drawing was
-- copied to <team>/<to>/<new_id>.png }]. Comments not in p_items are copied too, without their drawing. Returns the
-- new ids.
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
    insert into script_comments (id, script_id, team_id, quote, occurrence, body, kind, author_id, created_at, resolved_at, resolved_by, sketch_path, sketch_w, sketch_h, frame_id)
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
           case when i.sketch and c.sketch_path is not null then c.sketch_h end,
           c.frame_id
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
            and x.frame_id is not distinct from c.frame_id
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

-- ---------------------------------------------------------------------------
-- 0124's storage helpers, knowing the new bucket (a team's own folder)
-- ---------------------------------------------------------------------------
create or replace function public.team_storage_usage(p_team uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public, storage
as $$
declare
  v_prefix text := p_team::text || '/%';
  v_out jsonb;
begin
  if auth.uid() is not null and not exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and status = 'active') then
    return null;
  end if;
  with files as (
    -- In the team's own folder.
    select o.bucket_id, o.metadata
      from storage.objects o
     where o.bucket_id in ('team-logos', 'review-videos', 'long-review-videos', 'package-thumbs', 'mockup-library', 'script-sketches', 'media-kit', 'business-docs', 'video-frames', 'frame-guides')
       and o.name like v_prefix
    union all
    -- In a long video's folder.
    select o.bucket_id, o.metadata
      from storage.objects o
      join long_video_projects p on p.team_id = p_team and o.name like p.id::text || '/%'
     where o.bucket_id in ('thumbnails', 'comment-attachments')
    union all
    -- In a script's folder.
    select o.bucket_id, o.metadata
      from storage.objects o
      join scripts s on s.team_id = p_team and o.name like s.id::text || '/%'
     where o.bucket_id = 'script-images'
  ),
  sized as (
    select bucket_id, case when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint else 0 end as bytes from files
  ),
  per as (
    select bucket_id, count(*) as files, coalesce(sum(bytes), 0) as bytes from sized group by bucket_id
  )
  select jsonb_build_object(
    'bytes', coalesce((select sum(bytes) from per), 0),
    'files', coalesce((select sum(files) from per), 0),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('id', bucket_id, 'files', files, 'bytes', bytes) order by bytes desc) from per), '[]'::jsonb),
    'at', now()
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.team_storage_usage(uuid) from public, anon;
grant execute on function public.team_storage_usage(uuid) to authenticated, service_role;

create or replace function public.storage_team_of(p_bucket text, p_name text)
returns uuid
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_first text := split_part(coalesce(p_name, ''), '/', 1);
  v_team uuid;
begin
  if v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if p_bucket in ('team-logos', 'review-videos', 'long-review-videos', 'package-thumbs', 'mockup-library', 'script-sketches', 'media-kit', 'business-docs', 'video-frames', 'frame-guides') then
    return v_first::uuid;
  elsif p_bucket in ('thumbnails', 'comment-attachments') then
    select team_id into v_team from long_video_projects where id = v_first::uuid;
  elsif p_bucket = 'script-images' then
    select team_id into v_team from scripts where id = v_first::uuid;
  end if;
  return v_team;
end;
$$;
revoke all on function public.storage_team_of(text, text) from public, anon;
grant execute on function public.storage_team_of(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- App setup's check: the tables, and the comments' third kind
-- ---------------------------------------------------------------------------
create or replace function public.frame_guides_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select to_regclass('public.frame_guides') is not null
     and to_regclass('public.frame_categories') is not null
     and exists (
       select 1 from pg_constraint
        where conname = 'script_comments_kind_check'
          and pg_get_constraintdef(oid) like '%frame%'
     );
$$;
revoke all on function public.frame_guides_ready() from public, anon, authenticated;
grant execute on function public.frame_guides_ready() to service_role;

notify pgrst, 'reload schema';
