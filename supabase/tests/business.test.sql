-- Checks for 0120: Business. Only teams a developer turned it on for have it (nobody signed in turns it on); there the
-- owner reads and writes everything, and decides who else sees it (view, or edit too); nobody else, no other team.
-- Who and when are the database's; every change is kept in the history (which nobody writes); a closed year stays as
-- it is until it's reopened; an entry points only at its own team's sources, assets and entries; leaving the team or
-- becoming its owner takes access away; turned off, nobody reads the rows (they stay); the documents' bucket is private.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- O owns T. V: given view. E: given edit. N: on the team, nothing given. I: invited, not joined. X owns Y. (An owner's
-- own membership is the database's, made with the team.)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000120a1', 'o120@example.com'),
  ('00000000-0000-4000-8000-0000000120a2', 'v120@example.com'),
  ('00000000-0000-4000-8000-0000000120a3', 'e120@example.com'),
  ('00000000-0000-4000-8000-0000000120a4', 'n120@example.com'),
  ('00000000-0000-4000-8000-0000000120a5', 'i120@example.com'),
  ('00000000-0000-4000-8000-0000000120b1', 'x120@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%120@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000120a0', 'Team 120', 'team-120', '00000000-0000-4000-8000-0000000120a1'),
  ('10000000-0000-4000-8000-0000000120b0', 'Other 120', 'other-120', '00000000-0000-4000-8000-0000000120b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000120a2', '10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a2', 'v120@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000120a3', '10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a3', 'e120@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000120a4', '10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a4', 'n120@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000120a5', '10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a5', 'i120@example.com', 'invited')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000120a2', 'editor'),
  ('30000000-0000-4000-8000-0000000120a3', 'editor'),
  ('30000000-0000-4000-8000-0000000120a4', 'master'),
  ('30000000-0000-4000-8000-0000000120a5', 'editor')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 0. Who may call and touch what.
do $$
declare
  t text;
begin
  foreach t in array array['team_features', 'business_access', 'business_profiles', 'business_sources', 'business_years', 'business_entries', 'business_assets', 'business_inventories', 'business_inventory_items', 'business_files', 'business_ref_lines', 'business_history'] loop
    if has_table_privilege('anon', t, 'select') or has_table_privilege('anon', t, 'insert') then raise exception 'FAIL 0: someone who isn''t signed in can use %', t; end if;
  end loop;
  if has_table_privilege('authenticated', 'team_features', 'insert') or has_table_privilege('authenticated', 'team_features', 'update') or has_table_privilege('authenticated', 'team_features', 'delete') then
    raise exception 'FAIL 0: signed-in people may turn features on or off';
  end if;
  foreach t in array array['business_history', 'business_years'] loop
    if has_table_privilege('authenticated', t, 'insert') or has_table_privilege('authenticated', t, 'update') or has_table_privilege('authenticated', t, 'delete') then
      raise exception 'FAIL 0: signed-in people may write % themselves', t;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'business_access', 'granted_by', 'update') or has_column_privilege('authenticated', 'business_access', 'user_id', 'update')
     or has_column_privilege('authenticated', 'business_access', 'team_id', 'update') then
    raise exception 'FAIL 0: signed-in people may change more of business access than whether it edits';
  end if;
  if has_function_privilege('anon', 'business_team_ids()', 'execute') or has_function_privilege('anon', 'business_edit_team_ids()', 'execute')
     or has_function_privilege('anon', 'my_business_access(uuid)', 'execute') or has_function_privilege('anon', 'business_set_year(uuid, integer, boolean, boolean)', 'execute') then
    raise exception 'FAIL 0: someone who isn''t signed in may call 0120''s functions';
  end if;
  if has_function_privilege('authenticated', 'business_year_closed(uuid, date)', 'execute') or has_function_privilege('authenticated', 'business_row_guard()', 'execute')
     or has_function_privilege('authenticated', 'business_log()', 'execute') or has_function_privilege('authenticated', 'business_access_stamp()', 'execute')
     or has_function_privilege('authenticated', 'business_access_on_leave()', 'execute') or has_function_privilege('authenticated', 'business_access_new_owner()', 'execute') then
    raise exception 'FAIL 0: signed-in people may call the database''s own business functions';
  end if;
  if not has_function_privilege('authenticated', 'my_business_access(uuid)', 'execute') or not has_function_privilege('authenticated', 'business_set_year(uuid, integer, boolean, boolean)', 'execute') then
    raise exception 'FAIL 0: signed-in people need my_business_access and business_set_year (they check who''s asking)';
  end if;
  if (select public from storage.buckets where id = 'business-docs') is distinct from false
     or (select file_size_limit from storage.buckets where id = 'business-docs') is distinct from 20971520
     or (select allowed_mime_types from storage.buckets where id = 'business-docs') is null
     or exists (select 1 from storage.buckets b, unnest(b.allowed_mime_types) m where b.id = 'business-docs' and (m = 'image/svg+xml' or m like '%/*' or m like 'text/html%')) then
    raise exception 'FAIL 0: the documents'' bucket must be private, 20 MB, its own list of types (no SVG, no HTML)';
  end if;
end $$;

-- 1. Off: even the owner reads and writes nothing, and the menu says so.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is not null then raise exception 'FAIL 1: Business is off, yet the owner has it'; end if;
    begin
      insert into business_profiles (team_id, name) values ('10000000-0000-4000-8000-0000000120a0', 'PFA O');
      raise exception 'FAIL 1: a profile was written with Business off';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into team_features (team_id, feature) values ('10000000-0000-4000-8000-0000000120a0', 'business');
      raise exception 'FAIL 1: the owner turned Business on themselves';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- A developer turns it on for T and for Y (the server's key).
insert into team_features (team_id, feature) values
  ('10000000-0000-4000-8000-0000000120a0', 'business'),
  ('10000000-0000-4000-8000-0000000120b0', 'business')
on conflict do nothing;
insert into business_sources (id, team_id, name) values ('70000000-0000-4000-8000-0000000120b1', '10000000-0000-4000-8000-0000000120b0', 'Y activity')
on conflict do nothing;

-- 2. On: the owner writes the PFA, a source, entries, an asset, an inventory; who and when are the database's.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  insert into business_profiles (team_id, name, cui, regime, updated_by) values ('10000000-0000-4000-8000-0000000120a0', 'PFA O', '55738316', 'real', '00000000-0000-4000-8000-0000000120a3');
  insert into business_sources (id, team_id, name) values ('70000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0', 'PFA O, activități independente');
  insert into business_assets (id, team_id, inventory_no, name, acquired_on, in_service_on, value, life_months) values
    ('72000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0', 'MF-001', 'Camera', '2026-03-02', '2026-03-05', 12000, 36);
  insert into business_entries (id, team_id, entry_date, doc_type, doc_number, explanation, direction, channel, amount, kind, source_id, created_by, created_at) values
    ('71000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0', '2026-03-03', 'Bank statement', '3', 'AdSense', 'in', 'bank', 2800, 'income', '70000000-0000-4000-8000-0000000120a1', '00000000-0000-4000-8000-0000000120a3', '2001-01-01'),
    ('71000000-0000-4000-8000-0000000120a2', '10000000-0000-4000-8000-0000000120a0', '2026-03-04', 'Invoice', 'C-1', 'Camera', 'out', 'bank', 12000, 'asset', null, null, now());
  update business_entries set asset_id = '72000000-0000-4000-8000-0000000120a1' where id = '71000000-0000-4000-8000-0000000120a2';
  insert into business_inventories (id, team_id, taken_on) values ('73000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0', '2026-12-31');
  insert into business_ref_lines (id, team_id, year, source_id, kind, label, amount) values
    ('74000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0', 2026, '70000000-0000-4000-8000-0000000120a1', 'income', 'Phone received for a review (market value)', 4200);
  insert into business_inventory_items (team_id, inventory_id, item_group, name, value) values
    ('10000000-0000-4000-8000-0000000120a0', '73000000-0000-4000-8000-0000000120a1', 'fixed_asset', 'Camera', 12000);
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is distinct from 'owner' then raise exception 'FAIL 2: the owner isn''t the owner'; end if;
    if (select created_by from business_entries where id = '71000000-0000-4000-8000-0000000120a1') is distinct from '00000000-0000-4000-8000-0000000120a1'
       or (select created_at from business_entries where id = '71000000-0000-4000-8000-0000000120a1') < now() - interval '1 minute'
       or (select updated_by from business_profiles where team_id = '10000000-0000-4000-8000-0000000120a0') is distinct from '00000000-0000-4000-8000-0000000120a1' then
      raise exception 'FAIL 2: who wrote it and when should be the database''s';
    end if;
    if (select count(*) from business_history where team_id = '10000000-0000-4000-8000-0000000120a0') < 8 then raise exception 'FAIL 2: the history missed something'; end if;
    if (select created_by from business_ref_lines where id = '74000000-0000-4000-8000-0000000120a1') is distinct from '00000000-0000-4000-8000-0000000120a1' then raise exception 'FAIL 2: a fiscal line''s author should be the database''s'; end if;
    if not exists (select 1 from business_history where item = 'entry' and item_id = '71000000-0000-4000-8000-0000000120a2' and action = 'change' and changed_by = '00000000-0000-4000-8000-0000000120a1'
                   and before ->> 'asset_id' is null and after ->> 'asset_id' = '72000000-0000-4000-8000-0000000120a1') then
      raise exception 'FAIL 2: a change isn''t kept with what it was and what it became';
    end if;
  end $$;
commit;

-- 3. The owner gives V view and E edit; nobody inactive, outside, or the owner themselves.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  insert into business_access (team_id, user_id, can_edit, granted_by) values
    ('10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a2', false, '00000000-0000-4000-8000-0000000120a4'),
    ('10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a3', true, null);
  do $$ begin
    begin
      insert into business_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a5');
      raise exception 'FAIL 3: someone only invited was given it';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into business_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120b1');
      raise exception 'FAIL 3: someone not on the team was given it';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into business_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000120a0', '00000000-0000-4000-8000-0000000120a1');
      raise exception 'FAIL 3: the owner gave it to themselves';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
do $$ begin
  if (select granted_by from business_access where user_id = '00000000-0000-4000-8000-0000000120a2') is distinct from '00000000-0000-4000-8000-0000000120a1' then
    raise exception 'FAIL 3: who gave it should be the database''s';
  end if;
end $$;

-- 4. V reads, writes nothing, gives nothing; sees only their own access row.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a2');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is distinct from 'view' then raise exception 'FAIL 4: V should view'; end if;
    if (select count(*) from business_entries) <> 2 or (select count(*) from business_assets) <> 1 or (select count(*) from business_profiles) <> 1 or (select count(*) from business_history) < 7 then
      raise exception 'FAIL 4: V doesn''t read what they were given';
    end if;
    if (select count(*) from business_access) <> 1 then raise exception 'FAIL 4: V sees who else has it'; end if;
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'in', 'cash', 10, 'other');
      raise exception 'FAIL 4: V wrote an entry';
    exception when insufficient_privilege then null;
    end;
    update business_entries set amount = 1 where id = '71000000-0000-4000-8000-0000000120a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: V changed an entry'; end if;
    delete from business_entries where id = '71000000-0000-4000-8000-0000000120a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: V removed an entry'; end if;
    update business_access set can_edit = true where user_id = '00000000-0000-4000-8000-0000000120a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: V gave themselves edit'; end if;
    begin
      perform business_set_year('10000000-0000-4000-8000-0000000120a0', 2026, true, null);
      raise exception 'FAIL 4: V closed a year';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 4b. Given it, but not active on the team any more (back to invited): V reads nothing.
begin;
  update team_members set status = 'invited' where id = '30000000-0000-4000-8000-0000000120a2';
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a2');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is not null or exists (select 1 from business_entries) or exists (select 1 from business_history) then
      raise exception 'FAIL 4b: someone no longer active on the team still reads Business';
    end if;
  end $$;
rollback;

-- 5. N (a master, nothing given), I (invited) and X (another team) see nothing of T; X can't point at T, nor T at Y.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a4');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is not null then raise exception 'FAIL 5: N has it'; end if;
    if exists (select 1 from business_entries) or exists (select 1 from business_profiles) or exists (select 1 from business_history) or exists (select 1 from business_access) then
      raise exception 'FAIL 5: a master given nothing reads Business';
    end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a5');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from business_entries) then raise exception 'FAIL 5: someone invited reads Business'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from business_entries where team_id = '10000000-0000-4000-8000-0000000120a0') then raise exception 'FAIL 5: another team''s owner reads T'; end if;
    if exists (select 1 from team_features where team_id = '10000000-0000-4000-8000-0000000120a0') then raise exception 'FAIL 5: another team''s owner sees that T has Business'; end if;
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'in', 'cash', 10, 'other');
      raise exception 'FAIL 5: another team''s owner wrote into T';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  do $$ begin
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind, source_id) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'in', 'bank', 10, 'income', '70000000-0000-4000-8000-0000000120b1');
      raise exception 'FAIL 5: an entry pointed at another team''s source';
    exception when foreign_key_violation then null;
    end;
    begin
      update business_entries set team_id = '10000000-0000-4000-8000-0000000120b0' where id = '71000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 5: an entry moved to another team';
    exception when insufficient_privilege then null;
    end;
    -- 6. What an entry may be: the kinds go with the direction; below zero only to reverse another.
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'in', 'bank', 10, 'expense');
      raise exception 'FAIL 6: an expense came in';
    exception when check_violation then null;
    end;
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'out', 'bank', -10, 'expense');
      raise exception 'FAIL 6: a negative amount that reverses nothing';
    exception when check_violation then null;
    end;
    insert into business_entries (team_id, entry_date, direction, channel, amount, kind, source_id, reversal_of) values
      ('10000000-0000-4000-8000-0000000120a0', '2026-03-06', 'in', 'bank', -100, 'income', '70000000-0000-4000-8000-0000000120a1', '71000000-0000-4000-8000-0000000120a1');
    -- The VAT inside an amount: less than the amount, the same sign.
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, vat_amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'out', 'bank', 100, 100, 'expense');
      raise exception 'FAIL 6: VAT as big as the amount';
    exception when check_violation then null;
    end;
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, vat_amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'out', 'bank', 121, -21, 'expense');
      raise exception 'FAIL 6: VAT the other way round';
    exception when check_violation then null;
    end;
    insert into business_entries (team_id, entry_date, direction, channel, amount, vat_amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-03-05', 'out', 'bank', 121, 21, 'expense');
    begin
      insert into business_files (team_id, entry_id, path, name, size, mime) values ('10000000-0000-4000-8000-0000000120a0', '71000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120b0/x.pdf', 'x.pdf', 10, 'application/pdf');
      raise exception 'FAIL 6: a file kept outside the team''s folder';
    exception when check_violation then null;
    end;
    insert into business_files (team_id, entry_id, path, name, size, mime) values ('10000000-0000-4000-8000-0000000120a0', '71000000-0000-4000-8000-0000000120a1', '10000000-0000-4000-8000-0000000120a0/71000000-0000-4000-8000-0000000120a1/x.pdf', 'x.pdf', 10, 'application/pdf');
    -- History: nobody writes it, changes it or removes it.
    begin
      insert into business_history (team_id, item, item_id, action) values ('10000000-0000-4000-8000-0000000120a0', 'entry', 'x', 'add');
      raise exception 'FAIL 6: the history was written by hand';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from business_history;
      raise exception 'FAIL 6: the history was emptied';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 6b. A row stays on its team even for the server's key (no RLS there); a removal is kept in the history too.
begin;
  do $$ begin
    begin
      update business_inventories set team_id = '10000000-0000-4000-8000-0000000120b0' where id = '73000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 6b: an inventory moved to another team';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  insert into business_entries (id, team_id, entry_date, direction, channel, amount, kind) values
    ('71000000-0000-4000-8000-0000000120a9', '10000000-0000-4000-8000-0000000120a0', '2026-03-09', 'in', 'cash', 5, 'other');
  delete from business_entries where id = '71000000-0000-4000-8000-0000000120a9';
  do $$ begin
    if not exists (select 1 from business_history where item = 'entry' and item_id = '71000000-0000-4000-8000-0000000120a9' and action = 'remove'
                   and changed_by = '00000000-0000-4000-8000-0000000120a1' and before ->> 'amount' = '5.00' and after is null) then
      raise exception 'FAIL 6b: a removal isn''t kept in the history, with what it was';
    end if;
  end $$;
rollback;

-- 7. E edits, closes 2026: then nothing of 2026 changes (entries, the inventory, the asset's plan) until it's reopened.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a3');
  set local role authenticated;
  do $$
  declare y record;
  begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is distinct from 'edit' then raise exception 'FAIL 7: E should edit'; end if;
    insert into business_entries (id, team_id, entry_date, direction, channel, amount, kind, nature) values
      ('71000000-0000-4000-8000-0000000120a3', '10000000-0000-4000-8000-0000000120a0', '2026-04-01', 'out', 'bank', 50, 'expense', 'bank');
    -- In service in November 2025 (open), amortized into 2026 and 2027.
    insert into business_assets (id, team_id, inventory_no, name, acquired_on, in_service_on, value, life_months) values
      ('72000000-0000-4000-8000-0000000120a2', '10000000-0000-4000-8000-0000000120a0', 'MF-9', 'Laptop', '2025-11-03', '2025-11-10', 9000, 24);
    update business_entries set explanation = 'AdSense, March' where id = '71000000-0000-4000-8000-0000000120a1';
    select * into y from business_set_year('10000000-0000-4000-8000-0000000120a0', 2026, true, null);
    if y.closed_at is null or y.closed_by is distinct from '00000000-0000-4000-8000-0000000120a3' or y.rectified then raise exception 'FAIL 7: the year didn''t close as asked'; end if;
    begin
      insert into business_entries (team_id, entry_date, direction, channel, amount, kind) values ('10000000-0000-4000-8000-0000000120a0', '2026-05-01', 'in', 'cash', 10, 'other');
      raise exception 'FAIL 7: an entry was added to a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_entries set amount = 60 where id = '71000000-0000-4000-8000-0000000120a3';
      raise exception 'FAIL 7: an entry of a closed year changed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_entries set entry_date = '2025-12-31' where id = '71000000-0000-4000-8000-0000000120a3';
      raise exception 'FAIL 7: an entry left a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      delete from business_entries where id = '71000000-0000-4000-8000-0000000120a3';
      raise exception 'FAIL 7: an entry of a closed year was removed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      insert into business_inventory_items (team_id, inventory_id, item_group, name, value) values ('10000000-0000-4000-8000-0000000120a0', '73000000-0000-4000-8000-0000000120a1', 'bank', 'Bank', 100);
      raise exception 'FAIL 7: a closed year''s inventory grew';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_inventories set note = 'Counted again' where id = '73000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 7: a closed year''s inventory changed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_inventories set taken_on = '2027-01-01' where id = '73000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 7: an inventory left a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      delete from business_inventories where id = '73000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 7: a closed year''s inventory was removed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      insert into business_inventories (team_id, taken_on) values ('10000000-0000-4000-8000-0000000120a0', '2026-06-30');
      raise exception 'FAIL 7: an inventory was added to a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_ref_lines set amount = 1 where id = '74000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 7: a closed year''s fiscal line changed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      insert into business_ref_lines (team_id, year, source_id, kind, label, amount) values ('10000000-0000-4000-8000-0000000120a0', 2026, '70000000-0000-4000-8000-0000000120a1', 'expense', 'Late', 5);
      raise exception 'FAIL 7: a fiscal line was added to a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_assets set life_months = 48 where id = '72000000-0000-4000-8000-0000000120a1';
      raise exception 'FAIL 7: the plan of an asset from a closed year changed';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_assets set value = 9500 where id = '72000000-0000-4000-8000-0000000120a2';
      raise exception 'FAIL 7: an asset amortized into a closed year changed its plan (in service in an open one)';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      update business_assets set disposed_on = '2026-06-01' where id = '72000000-0000-4000-8000-0000000120a2';
      raise exception 'FAIL 7: an asset was sold in a closed year';
    exception when sqlstate 'BIZ01' then null;
    end;
    begin
      delete from business_assets where id = '72000000-0000-4000-8000-0000000120a2';
      raise exception 'FAIL 7: an asset amortized into a closed year was removed';
    exception when sqlstate 'BIZ01' then null;
    end;
    update business_assets set disposed_on = '2027-03-01', disposal_note = 'Sold' where id = '72000000-0000-4000-8000-0000000120a2';
    -- Writing down that it was sold later is fine.
    update business_assets set disposed_on = '2027-02-01', disposal_note = 'Sold' where id = '72000000-0000-4000-8000-0000000120a1';
    -- Another year still takes entries.
    insert into business_entries (team_id, entry_date, direction, channel, amount, kind, nature) values ('10000000-0000-4000-8000-0000000120a0', '2027-01-05', 'out', 'bank', 20, 'expense', 'software');
    -- Reopened: it changes again; the fiscal register's "Rectificare".
    select * into y from business_set_year('10000000-0000-4000-8000-0000000120a0', 2026, false, true);
    if y.closed_at is not null or y.closed_by is not null or not y.rectified then raise exception 'FAIL 7: the year didn''t reopen as asked'; end if;
    update business_entries set amount = 60 where id = '71000000-0000-4000-8000-0000000120a3';
    select * into y from business_set_year('10000000-0000-4000-8000-0000000120a0', 2026, null, null);
    if y.closed_at is not null or not y.rectified then raise exception 'FAIL 7: null should leave the year as it is'; end if;
    if (select count(*) from business_history where item = 'year' and item_id = '2026' and action in ('close', 'reopen')) <> 2 then raise exception 'FAIL 7: closing and reopening aren''t in the history'; end if;
  end $$;
commit;

-- 8. Storage: the team's people read its documents, its editors add and remove them; nobody else.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a3');
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('business-docs', '10000000-0000-4000-8000-0000000120a0/71000000-0000-4000-8000-0000000120a1/statement.pdf');
  do $$ begin
    begin
      insert into storage.objects (bucket_id, name) values ('business-docs', '10000000-0000-4000-8000-0000000120b0/x.pdf');
      raise exception 'FAIL 8: E put a document in another team''s folder';
    exception when insufficient_privilege then null;
    end;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a2');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if not exists (select 1 from storage.objects where bucket_id = 'business-docs') then raise exception 'FAIL 8: V can''t read the team''s documents'; end if;
    begin
      insert into storage.objects (bucket_id, name) values ('business-docs', '10000000-0000-4000-8000-0000000120a0/y.pdf');
      raise exception 'FAIL 8: V added a document';
    exception when insufficient_privilege then null;
    end;
    delete from storage.objects where bucket_id = 'business-docs';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 8: V removed a document'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a4');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from storage.objects where bucket_id = 'business-docs') then raise exception 'FAIL 8: N reads the documents'; end if;
  end $$;
rollback;

-- 9. Leaving takes it away; so does becoming the owner (who needs nothing given).
delete from team_members where id = '30000000-0000-4000-8000-0000000120a3';
do $$ begin
  if exists (select 1 from business_access where user_id = '00000000-0000-4000-8000-0000000120a3') then raise exception 'FAIL 9: E left and kept it'; end if;
end $$;
update teams set owner_id = '00000000-0000-4000-8000-0000000120a2' where id = '10000000-0000-4000-8000-0000000120a0';
do $$ begin
  if exists (select 1 from business_access where user_id = '00000000-0000-4000-8000-0000000120a2') then raise exception 'FAIL 9: the new owner kept the row given to them'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a2');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is distinct from 'owner' then raise exception 'FAIL 9: the new owner isn''t the owner'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a1');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is not null or exists (select 1 from business_entries) then raise exception 'FAIL 9: the old owner, given nothing, still reads it'; end if;
  end $$;
rollback;

-- 10. Turned off: the rows stay, nobody reads them.
delete from team_features where team_id = '10000000-0000-4000-8000-0000000120a0';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000120a2');
  set local role authenticated;
  do $$ begin
    if my_business_access('10000000-0000-4000-8000-0000000120a0') is not null or exists (select 1 from business_entries) or exists (select 1 from business_history) then
      raise exception 'FAIL 10: turned off, the owner still reads Business';
    end if;
  end $$;
rollback;
do $$ begin
  if (select count(*) from business_entries where team_id = '10000000-0000-4000-8000-0000000120a0') < 4 then raise exception 'FAIL 10: turning it off lost the rows'; end if;
end $$;

-- 11. A team going away takes its Business with it, history and all (nothing stops the delete).
delete from teams where id = '10000000-0000-4000-8000-0000000120a0';
do $$ begin
  if exists (select 1 from business_entries where team_id = '10000000-0000-4000-8000-0000000120a0') or exists (select 1 from business_history where team_id = '10000000-0000-4000-8000-0000000120a0') then
    raise exception 'FAIL 11: a deleted team left Business rows behind';
  end if;
end $$;

-- Tidy up.
delete from storage.objects where bucket_id = 'business-docs';
delete from teams where id = '10000000-0000-4000-8000-0000000120b0';
delete from profiles where email like '%120@example.com';
delete from auth.users where email like '%120@example.com';
select 'business checks passed' as ok;
