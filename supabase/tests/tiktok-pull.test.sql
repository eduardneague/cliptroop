-- Checks for 0126 (1.47.0): the bucket TikTok fetches posts from. Public (TikTok can't sign in), with a size limit,
-- videos and TikTok's verification file only, and no rule on storage.objects that names it: nobody lists it and
-- nobody signed in writes to it (only the server's key). Run by scripts/db/test-from-scratch.sh.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$
declare
  b record;
begin
  select * into b from storage.buckets where id = 'tiktok-pull';
  if not found then raise exception 'FAIL 1: no tiktok-pull bucket'; end if;
  if not b.public then raise exception 'FAIL 1: tiktok-pull must be public (TikTok fetches from it)'; end if;
  if b.file_size_limit is distinct from 4294967296 then raise exception 'FAIL 1: tiktok-pull takes files up to %', b.file_size_limit; end if;
  if b.allowed_mime_types is null or exists (select 1 from unnest(b.allowed_mime_types) t where t not like 'video/%' and t <> 'text/plain') then
    raise exception 'FAIL 1: tiktok-pull takes %', b.allowed_mime_types;
  end if;
  if 'text/html' = any (b.allowed_mime_types) or 'image/svg+xml' = any (b.allowed_mime_types) then raise exception 'FAIL 1: tiktok-pull could serve a page'; end if;

  -- 2. No rule names it: not for reading (listing), not for writing.
  if exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
             and (coalesce(p.qual, '') like '%tiktok-pull%' or coalesce(p.with_check, '') like '%tiktok-pull%')) then
    raise exception 'FAIL 2: a rule on storage.objects opens tiktok-pull';
  end if;

  -- 3. The videos themselves stay private.
  if (select public from storage.buckets where id = 'review-videos') then raise exception 'FAIL 3: review-videos is public'; end if;
end $$;

select 'tiktok-pull checks passed' as ok;
