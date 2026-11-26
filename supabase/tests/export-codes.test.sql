-- Checks for 0138: a code to export. Run by scripts/db/test-from-scratch.sh.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000138a1', 'x138@example.com') on conflict do nothing;
insert into profiles (id, email) select id, email from auth.users where email = 'x138@example.com' on conflict do nothing;

-- 1. The three kinds go in; anything else doesn't.
do $$
declare
  k text;
begin
  foreach k in array array['sign_in', 'setup', 'export'] loop
    insert into two_step_codes (user_id, code_hash, purpose, expires_at)
    values ('00000000-0000-4000-8000-0000000138a1', repeat('a', 64), k, now() + interval '10 minutes')
    on conflict (user_id) do update set purpose = excluded.purpose;
    if (select purpose from two_step_codes where user_id = '00000000-0000-4000-8000-0000000138a1') <> k then
      raise exception '1: a code to % wasn''t kept', k;
    end if;
  end loop;
  begin
    update two_step_codes set purpose = 'delete' where user_id = '00000000-0000-4000-8000-0000000138a1';
    raise exception '1: a fourth kind went in';
  exception when check_violation then null;
  end;
  if (select count(*) from pg_constraint where conrelid = 'public.two_step_codes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%purpose%') <> 1 then
    raise exception '1: one check on the kind, not two';
  end if;
  delete from two_step_codes where user_id = '00000000-0000-4000-8000-0000000138a1';
end;
$$;

-- 2. App setup's check says yes, and only the service key may ask.
do $$
begin
  if not public.export_codes_ready() then raise exception '2: export_codes_ready() says no'; end if;
  if has_function_privilege('anon', 'public.export_codes_ready()', 'execute') or has_function_privilege('authenticated', 'public.export_codes_ready()', 'execute') then
    raise exception '2: people can call export_codes_ready()';
  end if;
  if not has_function_privilege('service_role', 'public.export_codes_ready()', 'execute') then raise exception '2: the service key can''t call it'; end if;
end;
$$;

-- 3. The codes are still the server's only (0125): nobody signed in reads, writes or makes one.
do $$
begin
  if has_table_privilege('authenticated', 'public.two_step_codes', 'select') or has_table_privilege('authenticated', 'public.two_step_codes', 'insert')
     or has_table_privilege('authenticated', 'public.two_step_codes', 'update') or has_table_privilege('anon', 'public.two_step_codes', 'select') then
    raise exception '3: people reach two_step_codes';
  end if;
end;
$$;

delete from profiles where id = '00000000-0000-4000-8000-0000000138a1';
delete from auth.users where id = '00000000-0000-4000-8000-0000000138a1';
