-- Checks for 0095: clearing notifications out of the bell. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: R (reads the bell) and O (someone else).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000ce1', 'r-bell@example.com'),
  ('00000000-0000-4000-8000-000000000ce2', 'o-bell@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000ce1', 'r-bell@example.com'),
  ('00000000-0000-4000-8000-000000000ce2', 'o-bell@example.com')
on conflict do nothing;
insert into notifications (id, recipient_id, body, created_at) values
  ('00000000-0000-4000-8000-0000000c1ea1', '00000000-0000-4000-8000-000000000ce1', 'first', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000c1ea2', '00000000-0000-4000-8000-000000000ce1', 'second', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000c1ea3', '00000000-0000-4000-8000-000000000ce2', 'theirs', now())
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. New notifications aren't cleared.
do $$
begin
  if exists (select 1 from notifications where id in ('00000000-0000-4000-8000-0000000c1ea1', '00000000-0000-4000-8000-0000000c1ea2', '00000000-0000-4000-8000-0000000c1ea3') and cleared_at is not null) then
    raise exception '1: a new notification should not start cleared';
  end if;
end;
$$;

-- 2. Signed in: you clear your own (and it's read), not someone else's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000ce1');
  set local role authenticated;
  update notifications set cleared_at = now(), is_read = true where id = '00000000-0000-4000-8000-0000000c1ea1';
  update notifications set cleared_at = now(), is_read = true where id = '00000000-0000-4000-8000-0000000c1ea3';
commit;
do $$
begin
  if not (select cleared_at is not null and is_read from notifications where id = '00000000-0000-4000-8000-0000000c1ea1') then
    raise exception '2: your own notification should be cleared and read';
  end if;
  if (select cleared_at is not null or is_read from notifications where id = '00000000-0000-4000-8000-0000000c1ea3') then
    raise exception '2: someone else''s notification must not change';
  end if;
end;
$$;

-- 3. Clearing is all a reader can change besides is_read: the words stay as the server wrote them.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000ce1');
  set local role authenticated;
  do $$ begin
    begin
      update notifications set body = 'forged' where id = '00000000-0000-4000-8000-0000000c1ea2';
      raise exception '3: changing the text should be refused';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;

-- 4. The bell's list: only the ones not cleared (and only yours).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000ce1');
  set local role authenticated;
  do $$
  declare ids uuid[];
  begin
    select array_agg(id order by created_at desc) into ids
      from notifications
     where recipient_id = '00000000-0000-4000-8000-000000000ce1' and cleared_at is null;
    if ids is distinct from array['00000000-0000-4000-8000-0000000c1ea2']::uuid[] then
      raise exception '4: the bell should list only the one not cleared, got %', ids;
    end if;
    -- History (everything) still has both.
    if (select count(*) from notifications where recipient_id = '00000000-0000-4000-8000-000000000ce1') <> 2 then
      raise exception '4: History should still have the cleared one';
    end if;
  end;
  $$;
commit;

-- 5. The bell's own index is there, for the ones not cleared.
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where tablename = 'notifications' and indexname = 'notifications_inbox_idx' and indexdef ilike '%where (cleared_at is null)%'
  ) then
    raise exception '5: notifications_inbox_idx (not cleared) should exist';
  end if;
end;
$$;

-- Tidy up.
delete from notifications where id in ('00000000-0000-4000-8000-0000000c1ea1', '00000000-0000-4000-8000-0000000c1ea2', '00000000-0000-4000-8000-0000000c1ea3');
