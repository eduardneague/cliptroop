-- Checks for 0123 (Liquid's light that follows the pointer, on or off).
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000123a1', 'l-light@example.com'),
  ('00000000-0000-4000-8000-0000000123a2', 'm-light@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000123a1', 'l-light@example.com'),
  ('00000000-0000-4000-8000-0000000123a2', 'm-light@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. On for everyone to start with, and never empty.
do $$
begin
  if exists (select 1 from profiles where id in ('00000000-0000-4000-8000-0000000123a1', '00000000-0000-4000-8000-0000000123a2') and glass_light is distinct from true) then
    raise exception '1: the pointer light should start on';
  end if;
  begin
    update profiles set glass_light = null where id = '00000000-0000-4000-8000-0000000123a1';
    raise exception '1: the pointer light should never be empty';
  exception when not_null_violation then null;
  end;
end;
$$;

-- 2. A person switches their own off (and on); someone else's stays as it is.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000123a1');
set local role authenticated;
update profiles set glass_light = false where id = '00000000-0000-4000-8000-0000000123a1';
update profiles set glass_light = false where id = '00000000-0000-4000-8000-0000000123a2';
reset role;
do $$
begin
  if (select glass_light from profiles where id = '00000000-0000-4000-8000-0000000123a1') is distinct from false then
    raise exception '2: a person should be able to switch their own light off';
  end if;
  if (select glass_light from profiles where id = '00000000-0000-4000-8000-0000000123a2') is distinct from true then
    raise exception '2: nobody switches someone else''s light';
  end if;
end;
$$;
commit;

-- 3. Safe to run twice.
alter table public.profiles add column if not exists glass_light boolean not null default true;
grant update (glass_light) on profiles to authenticated;

delete from profiles where id in ('00000000-0000-4000-8000-0000000123a1', '00000000-0000-4000-8000-0000000123a2');
delete from auth.users where id in ('00000000-0000-4000-8000-0000000123a1', '00000000-0000-4000-8000-0000000123a2');
