-- Checks for 0139: where a company's money goes, and its picture. A payout is one of the known ways (or none); a
-- picture is an https link; the people who manage sponsorships change both, an editor neither. Uploaded pictures go in
-- the team's own folder of a public bucket, added only by its managers; nobody signed in lists or removes them.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). G: editor M lets in. E: editor. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000139a1', 'm139@example.com'),
  ('00000000-0000-4000-8000-0000000139a2', 'g139@example.com'),
  ('00000000-0000-4000-8000-0000000139a3', 'e139@example.com'),
  ('00000000-0000-4000-8000-0000000139b1', 'x139@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%139@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000139a0', 'Team 139', 'team-139', '00000000-0000-4000-8000-0000000139a1'),
  ('10000000-0000-4000-8000-0000000139b0', 'Other 139', 'other-139', '00000000-0000-4000-8000-0000000139b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000139a2', '10000000-0000-4000-8000-0000000139a0', '00000000-0000-4000-8000-0000000139a2', 'g139@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000139a3', '10000000-0000-4000-8000-0000000139a0', '00000000-0000-4000-8000-0000000139a3', 'e139@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000139a2', 'editor'),
  ('30000000-0000-4000-8000-0000000139a3', 'editor')
on conflict do nothing;
insert into affiliates (id, team_id, name) values
  ('20000000-0000-4000-8000-0000000139a1', '10000000-0000-4000-8000-0000000139a0', 'Gravastar')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- M lets G in.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139a1');
  set local role authenticated;
  insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000139a0', '00000000-0000-4000-8000-0000000139a2');
commit;

-- 1. A payout is one of the known ways, or none.
do $$
declare
  k text;
begin
  foreach k in array array['bank', 'paypal', 'wise', 'payoneer', 'revolut', 'credit', 'other'] loop
    update affiliates set payout = k where id = '20000000-0000-4000-8000-0000000139a1';
  end loop;
  update affiliates set payout = null where id = '20000000-0000-4000-8000-0000000139a1';
  begin
    update affiliates set payout = 'iban RO49AAAA1B31007593840000' where id = '20000000-0000-4000-8000-0000000139a1';
    raise exception 'FAIL 1: account details went in as a payout';
  exception when check_violation then null;
  end;
  begin
    update affiliates set payout = '' where id = '20000000-0000-4000-8000-0000000139a1';
    raise exception 'FAIL 1: an empty payout went in';
  exception when check_violation then null;
  end;
end $$;

-- 2. A picture is a link on the web (https), not too long; none is fine.
do $$
declare
  bad text;
begin
  update affiliates set picture_url = 'https://cdn.example.com/gravastar.png' where id = '20000000-0000-4000-8000-0000000139a1';
  update affiliates set picture_url = null where id = '20000000-0000-4000-8000-0000000139a1';
  foreach bad in array array['http://cdn.example.com/x.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://cdn.example.com/a b.png', 'https://' || repeat('a', 2000)] loop
    begin
      update affiliates set picture_url = bad where id = '20000000-0000-4000-8000-0000000139a1';
      raise exception 'FAIL 2: % went in as a picture', left(bad, 40);
    exception when check_violation then null;
    end;
  end loop;
end $$;

-- 3. The managers change them; an editor doesn't, nor another team's master.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139a2');
  set local role authenticated;
  update affiliates set payout = 'paypal', picture_url = 'https://cdn.example.com/g.png' where id = '20000000-0000-4000-8000-0000000139a1';
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139a3');
  set local role authenticated;
  update affiliates set payout = 'bank', picture_url = null where id = '20000000-0000-4000-8000-0000000139a1';
  do $$ begin
    if (select payout from affiliates where id = '20000000-0000-4000-8000-0000000139a1') is distinct from 'paypal' then raise exception 'FAIL 3: the editor doesn''t see it'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139b1');
  set local role authenticated;
  update affiliates set payout = 'other' where id = '20000000-0000-4000-8000-0000000139a1';
commit;
do $$ begin
  if (select payout || ' ' || picture_url from affiliates where id = '20000000-0000-4000-8000-0000000139a1') is distinct from 'paypal https://cdn.example.com/g.png' then
    raise exception 'FAIL 3: someone who doesn''t manage it changed where its money goes or its picture';
  end if;
end $$;

-- 4. The bucket: public, pictures only, 5 MB (as 0103's picture buckets; public-files.test.sql holds them all to it).
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'sponsor-pictures' and public and file_size_limit = 5242880 and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp'] and not (allowed_mime_types @> array['image/svg+xml'])) then
    raise exception 'FAIL 4: the bucket isn''t public, 5 MB, pictures only';
  end if;
end $$;

-- 5. Uploads: a manager in the team's folder; never an editor, never another team's folder.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139a2');
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('sponsor-pictures', '10000000-0000-4000-8000-0000000139a0/company-1.webp');
  insert into storage.objects (bucket_id, name) values ('sponsor-pictures', '10000000-0000-4000-8000-0000000139a0/company-2.webp');
commit;
do $$
declare
  who text;
  folder text;
  ok boolean;
begin
  foreach who in array array['00000000-0000-4000-8000-0000000139a3', '00000000-0000-4000-8000-0000000139b1', '00000000-0000-4000-8000-0000000139a2'] loop
    folder := case when who = '00000000-0000-4000-8000-0000000139a2' then '10000000-0000-4000-8000-0000000139b0' else '10000000-0000-4000-8000-0000000139a0' end;
    ok := true;
    begin
      perform pg_temp.as_user(who::uuid);
      set local role authenticated;
      insert into storage.objects (bucket_id, name) values ('sponsor-pictures', folder || '/sneaky.webp');
      ok := false;
    exception when insufficient_privilege then null;
    end;
    reset role;
    if not ok then raise exception 'FAIL 5: % put a picture in %''s folder', who, folder; end if;
  end loop;
end $$;
-- Another team's master, in their own folder: fine.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139b1');
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('sponsor-pictures', '10000000-0000-4000-8000-0000000139b0/theirs.webp');
commit;

-- 6. Nobody signed in lists them or removes them (not even a manager: the server does, with its own key).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000139a2');
  set local role authenticated;
  delete from storage.objects where bucket_id = 'sponsor-pictures';
  do $$ begin
    if exists (select 1 from storage.objects where bucket_id = 'sponsor-pictures') then raise exception 'FAIL 6: the team''s pictures can be listed'; end if;
  end $$;
commit;
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'sponsor-pictures' and name like '10000000-0000-4000-8000-0000000139%') <> 3 then
    raise exception 'FAIL 6: someone signed in removed a picture';
  end if;
end $$;

delete from storage.objects where bucket_id = 'sponsor-pictures' and name like '10000000-0000-4000-8000-0000000139%';
