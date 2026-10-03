-- ============================================================================
-- 0056: sketches on script comments (editing ideas)
--
--   * script_comments.sketch_path: a drawing made in the Sketch Studio, stored
--     as a PNG in the "script-sketches" bucket at <team>/<script>/<id>.png
--     (the editable drawing sits next to it as <id>.json). sketch_w/sketch_h:
--     its size in pixels (for layout and exports).
--   * The path must be inside the comment's own team/script folder, and only
--     the author may change it later (like the text).
--   * Bucket: public read (unguessable names, like script-images); any
--     teammate may upload into their team's script folders; files are
--     removed by the server when their comment is deleted.
--   * @mentions need no schema change: they're resolved from the text when
--     the comment is posted (lib/mentions), notifications kind "script_mention".
-- Run on staging, then production. Safe to run more than once.
-- ============================================================================

alter table script_comments
  add column if not exists sketch_path text,
  add column if not exists sketch_w int,
  add column if not exists sketch_h int;

alter table script_comments drop constraint if exists script_comments_sketch_size;
alter table script_comments add constraint script_comments_sketch_size
  check (sketch_path is null or (sketch_w between 1 and 8000 and sketch_h between 1 and 8000));

-- Same rules as 0050, plus: the sketch lives in this comment's folder, and
-- only the author changes text or sketch.
create or replace function script_comments_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from scripts where id = new.script_id;
    new.author_id := auth.uid();
    new.created_at := now();
    new.resolved_at := null;
    new.resolved_by := null;
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

-- Storage ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('script-sketches', 'script-sketches', true, 10485760, array['image/png', 'application/json'])
on conflict (id) do nothing;

-- Any teammate may add a drawing to a document of their team (anyone can
-- comment). Folder: <team>/<script>/…, and the script must be in that team.
drop policy if exists "teammates upload sketches" on storage.objects;
create policy "teammates upload sketches"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'script-sketches'
    and exists (
      select 1 from scripts s
       where s.id::text = (storage.foldername(name))[2]
         and s.team_id::text = (storage.foldername(name))[1]
         and s.team_id in (select my_team_ids())
    )
  );
