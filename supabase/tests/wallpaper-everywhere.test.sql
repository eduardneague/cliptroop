-- Checks for 0098: wallpapers 2 MB at most, and a wallpaper on every page.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000098a1', 'w-every@example.com'),
  ('00000000-0000-4000-8000-0000000098a2', 'x-every@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000098a1', 'w-every@example.com'),
  ('00000000-0000-4000-8000-0000000098a2', 'x-every@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. The bucket takes 2 MB at most now, the same kinds of file as before.
do $$
begin
  if (select file_size_limit from storage.buckets where id = 'dashboard-backgrounds') <> 2097152 then
    raise exception '1: wallpapers should be 2 MB at most';
  end if;
  if not (select 'video/webm' = any(allowed_mime_types) and 'image/webp' = any(allowed_mime_types) from storage.buckets where id = 'dashboard-backgrounds') then
    raise exception '1: WebP and WebM should still be allowed';
  end if;
end;
$$;

-- 2. Off by default; yours to turn on, not someone else's.
do $$
begin
  if (select dashboard_bg_everywhere from profiles where id = '00000000-0000-4000-8000-0000000098a1') then
    raise exception '2: the wallpaper should start on the dashboard only';
  end if;
end;
$$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000098a1');
  set local role authenticated;
  update profiles set dashboard_bg_everywhere = true where id = '00000000-0000-4000-8000-0000000098a1';
  update profiles set dashboard_bg_everywhere = true where id = '00000000-0000-4000-8000-0000000098a2';
commit;
do $$
begin
  if not (select dashboard_bg_everywhere from profiles where id = '00000000-0000-4000-8000-0000000098a1') then
    raise exception '2: you should be able to show it on every page';
  end if;
  if (select dashboard_bg_everywhere from profiles where id = '00000000-0000-4000-8000-0000000098a2') then
    raise exception '2: someone else''s choice must not change';
  end if;
end;
$$;
