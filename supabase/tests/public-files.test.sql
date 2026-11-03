-- Checks for 0103 (public files, 1.31.1) and 0104 (smaller pictures,
-- 1.31.3): every public bucket has a size limit; the picture buckets take
-- pictures only (never an SVG or a web page), 5 MB, thumbnails 15 MB;
-- nobody can list what's in a public bucket (a file opens only by its
-- exact, random address); videos and other private files stay private. Run
-- by scripts/db/test-from-scratch.sh on the database the migrations just
-- built; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$
declare
  b record;
  pictures text[] := array['avatars', 'team-logos', 'thumbnails', 'script-images'];
begin
  -- 1. The picture buckets: pictures only; 5 MB, thumbnails 15 MB (0104).
  for b in select * from storage.buckets where id = any (pictures) loop
    if b.file_size_limit is distinct from (case when b.id = 'thumbnails' then 15728640 else 5242880 end) then raise exception 'FAIL 1: % takes files up to %', b.id, b.file_size_limit; end if;
    if b.allowed_mime_types is null or cardinality(b.allowed_mime_types) = 0 then raise exception 'FAIL 1: % takes any kind of file', b.id; end if;
    if exists (select 1 from unnest(b.allowed_mime_types) t where t not like 'image/%' or t in ('image/svg+xml', 'image/*')) then
      raise exception 'FAIL 1: % takes %', b.id, b.allowed_mime_types;
    end if;
  end loop;
  if (select count(*) from storage.buckets where id = any (pictures)) <> 4 then raise exception 'FAIL 1: a picture bucket is missing'; end if;

  -- 2. Every public bucket has a size limit; comment attachments: any kind, 25 MB.
  for b in select * from storage.buckets where public loop
    if b.file_size_limit is null then raise exception 'FAIL 2: public bucket % has no size limit', b.id; end if;
  end loop;
  if (select file_size_limit from storage.buckets where id = 'comment-attachments') is distinct from 26214400 then raise exception 'FAIL 2: comment attachments limit'; end if;

  -- 3. No one can list a public bucket: no read rule on storage.objects names one.
  for b in select * from storage.buckets where public loop
    if exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.cmd in ('SELECT', 'ALL') and coalesce(p.qual, '') like '%''' || b.id || '''%') then
      raise exception 'FAIL 3: someone can list public bucket %', b.id;
    end if;
  end loop;

  -- 4b. Thumbnail Studio's pictures (private): pictures only, 15 MB (0104).
  select * into b from storage.buckets where id = 'package-thumbs';
  if b.file_size_limit is distinct from 15728640 or b.allowed_mime_types is null or 'image/svg+xml' = any (b.allowed_mime_types) or exists (select 1 from unnest(b.allowed_mime_types) t where t not like 'image/%') then
    raise exception 'FAIL 4b: package-thumbs takes % up to %', b.allowed_mime_types, b.file_size_limit;
  end if;

  -- 4. Videos, frames, package thumbnails, the library and feedback stay private.
  if exists (select 1 from storage.buckets where id in ('review-videos', 'long-review-videos', 'video-frames', 'package-thumbs', 'mockup-library', 'feedback') and public) then
    raise exception 'FAIL 4: a private bucket is public';
  end if;
end $$;

select 'public-files checks passed' as ok;
