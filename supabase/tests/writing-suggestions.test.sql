-- Checks for 0087 (writing suggestions): the team's dictionary. Teammates
-- read it and add to it (who added a word is stamped, never chosen), one of
-- each word per team whatever the capitals, single words only, removed by
-- whoever added it or a master, nobody outside the team sees or touches it,
-- and 5,000 words at most. Run by scripts/db/test-from-scratch.sh; each check
-- raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M = master of team G, X and Y = editors in team G, O = master of team H.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'dm@example.com'),
  ('00000000-0000-4000-8000-0000000000c2', 'dx@example.com'),
  ('00000000-0000-4000-8000-0000000000c3', 'dy@example.com'),
  ('00000000-0000-4000-8000-0000000000c4', 'do@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'dm@example.com'),
  ('00000000-0000-4000-8000-0000000000c2', 'dx@example.com'),
  ('00000000-0000-4000-8000-0000000000c3', 'dy@example.com'),
  ('00000000-0000-4000-8000-0000000000c4', 'do@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000000c1', 'Team G', 'dictionary-team-g', '00000000-0000-4000-8000-0000000000c1'),
  ('10000000-0000-4000-8000-0000000000c4', 'Team H', 'dictionary-team-h', '00000000-0000-4000-8000-0000000000c4')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'dx@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000000c3', '10000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c3', 'dy@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000000c2', 'editor'),
  ('20000000-0000-4000-8000-0000000000c3', 'editor')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. A teammate adds words; who added them is stamped.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
  set local role authenticated;
  insert into team_dictionary (id, team_id, word) values
    ('30000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 'MrBeast'),
    ('30000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-0000000000c1', 'ClipTroop');
commit;
do $$ begin
  if (select added_by from team_dictionary where id = '30000000-0000-4000-8000-0000000000c1') <> '00000000-0000-4000-8000-0000000000c2' then
    raise exception 'FAIL 1: who added the word is stamped';
  end if;
end $$;

-- 2. Nobody chooses who added it, or changes a word.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
  set local role authenticated;
  do $$ begin
    begin
      insert into team_dictionary (team_id, word, added_by) values ('10000000-0000-4000-8000-0000000000c1', 'Sneaky', '00000000-0000-4000-8000-0000000000c1');
      raise exception 'FAIL 2: added_by could be chosen';
    exception when insufficient_privilege then null;
    end;
    begin
      update team_dictionary set word = 'Other' where id = '30000000-0000-4000-8000-0000000000c1';
      raise exception 'FAIL 2: a word could be changed';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 3. One of each word per team, whatever the capitals; single words only.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
  set local role authenticated;
  do $$ begin
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c1', 'mrbeast');
      raise exception 'FAIL 3: the same word twice';
    exception when unique_violation then null;
    end;
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c1', 'two words');
      raise exception 'FAIL 3: a phrase went in';
    exception when check_violation then null;
    end;
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c1', ' padded');
      raise exception 'FAIL 3: spaces around a word went in';
    exception when check_violation then null;
    end;
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c1', repeat('x', 49));
      raise exception 'FAIL 3: a 49 letter word went in';
    exception when check_violation then null;
    end;
  end $$;
rollback;

-- 4. Outside the team: nothing to see, nothing to add or remove.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c4');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if (select count(*) from team_dictionary where team_id = '10000000-0000-4000-8000-0000000000c1') <> 0 then
      raise exception 'FAIL 4: another team''s words are visible';
    end if;
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c1', 'Intruder');
      raise exception 'FAIL 4: added to another team';
    exception when insufficient_privilege then null;
    end;
    delete from team_dictionary where team_id = '10000000-0000-4000-8000-0000000000c1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: removed another team''s words'; end if;
  end $$;
rollback;

-- 5. Teammates read it; only who added a word, or a master, removes it.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
  set local role authenticated;
  do $$
  declare n int;
  begin
    if (select count(*) from team_dictionary where team_id = '10000000-0000-4000-8000-0000000000c1') <> 2 then
      raise exception 'FAIL 5: teammates read the dictionary';
    end if;
    delete from team_dictionary where id = '30000000-0000-4000-8000-0000000000c1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 5: someone else''s word was removed by a teammate'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
  set local role authenticated;
  delete from team_dictionary where id = '30000000-0000-4000-8000-0000000000c2';
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
  set local role authenticated;
  delete from team_dictionary where id = '30000000-0000-4000-8000-0000000000c1';
commit;
do $$ begin
  if exists (select 1 from team_dictionary where team_id = '10000000-0000-4000-8000-0000000000c1') then
    raise exception 'FAIL 5: who added it, and the master, can remove words';
  end if;
end $$;

-- 6. 5,000 words at most.
insert into team_dictionary (team_id, word, added_by)
select '10000000-0000-4000-8000-0000000000c4', 'word' || g, null from generate_series(1, 5000) g;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000c4');
  set local role authenticated;
  do $$ begin
    begin
      insert into team_dictionary (team_id, word) values ('10000000-0000-4000-8000-0000000000c4', 'OneTooMany');
      raise exception 'FAIL 6: more than 5,000 words';
    exception when check_violation then null;
    end;
  end $$;
rollback;
delete from team_dictionary where team_id = '10000000-0000-4000-8000-0000000000c4';
