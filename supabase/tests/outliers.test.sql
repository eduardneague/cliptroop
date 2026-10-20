-- Access checks for 0091 (Outliers): who may add and change niches, track
-- channels, save, make folders, hide ideas and set the alerts; what the
-- server alone writes; the tidy-ups and limits. Run by
-- scripts/db/test-from-scratch.sh on the database the migrations just built;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team A, R = researcher in A, E = editor in A, O = master of team B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009a1', 'om@example.com'),
  ('00000000-0000-4000-8000-0000000009a2', 'or@example.com'),
  ('00000000-0000-4000-8000-0000000009a3', 'oe@example.com'),
  ('00000000-0000-4000-8000-0000000009b1', 'oo@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000009a1', 'om@example.com'),
  ('00000000-0000-4000-8000-0000000009a2', 'or@example.com'),
  ('00000000-0000-4000-8000-0000000009a3', 'oe@example.com'),
  ('00000000-0000-4000-8000-0000000009b1', 'oo@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000009aa', 'Outliers A', 'outliers-a', '00000000-0000-4000-8000-0000000009a1'),
  ('10000000-0000-4000-8000-0000000009bb', 'Outliers B', 'outliers-b', '00000000-0000-4000-8000-0000000009b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000009a2', '10000000-0000-4000-8000-0000000009aa', '00000000-0000-4000-8000-0000000009a2', 'or@example.com', 'active'),
  ('20000000-0000-4000-8000-0000000009a3', '10000000-0000-4000-8000-0000000009aa', '00000000-0000-4000-8000-0000000009a3', 'oe@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('20000000-0000-4000-8000-0000000009a2', 'researcher'),
  ('20000000-0000-4000-8000-0000000009a3', 'editor')
on conflict do nothing;
-- YouTube's data, as the server writes it.
insert into yt_channels (id, title, subscribers) values ('UCtesttesttesttesttest01', 'Test channel', 1000) on conflict do nothing;
insert into yt_videos (id, channel_id, title, published_at, kind, views, score) values ('testvideo01', 'UCtesttesttesttesttest01', 'A fake phone test', now() - interval '3 days', 'long', 5000, 6) on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end $$;

-- 1. Masters and researchers add niches (tidied up, made by them); editors and other teams can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a2');
  set local role authenticated;
  insert into outlier_niches (id, team_id, name, keywords) values ('30000000-0000-4000-8000-0000000009a1', '10000000-0000-4000-8000-0000000009aa', '  Phones   and  more ', array[' Fake iPhone', 'fake iphone', '', 'PHONE review']);
commit;
do $$ begin
  if (select name from outlier_niches where id = '30000000-0000-4000-8000-0000000009a1') <> 'Phones and more' then raise exception 'FAIL 1: name not tidied'; end if;
  if (select keywords from outlier_niches where id = '30000000-0000-4000-8000-0000000009a1') <> array['fake iphone', 'phone review'] then raise exception 'FAIL 1: keywords not tidied (%)', (select keywords from outlier_niches where id = '30000000-0000-4000-8000-0000000009a1'); end if;
  if (select created_by from outlier_niches where id = '30000000-0000-4000-8000-0000000009a1') <> '00000000-0000-4000-8000-0000000009a2' then raise exception 'FAIL 1: created_by not stamped'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_niches (team_id, name) values ('10000000-0000-4000-8000-0000000009aa', 'Nope')$q$) then raise exception 'FAIL 1: an editor added a niche'; end if;
    if (select count(*) from outlier_niches where team_id = '10000000-0000-4000-8000-0000000009aa') <> 1 then raise exception 'FAIL 1: a teammate should see the niche'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009b1');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_niches (team_id, name) values ('10000000-0000-4000-8000-0000000009aa', 'Sneaky')$q$) then raise exception 'FAIL 1: another team added a niche'; end if;
    if (select count(*) from outlier_niches where team_id = '10000000-0000-4000-8000-0000000009aa') <> 0 then raise exception 'FAIL 1: another team sees the niche'; end if;
  end $$;
commit;

-- 2. Nobody but the server writes insights, the collector's state or which team it is.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$update outlier_niches set insights = '{}' where id = '30000000-0000-4000-8000-0000000009a1'$q$) then raise exception 'FAIL 2: a master wrote insights'; end if;
    if not pg_temp.fails($q$update outlier_niches set crawl = '{}' where id = '30000000-0000-4000-8000-0000000009a1'$q$) then raise exception 'FAIL 2: a master wrote the collector state'; end if;
    update outlier_niches set name = 'Phones' where id = '30000000-0000-4000-8000-0000000009a1';
  end $$;
commit;
do $$ begin
  if (select name from outlier_niches where id = '30000000-0000-4000-8000-0000000009a1') <> 'Phones' then raise exception 'FAIL 2: a master renamed it'; end if;
end $$;

-- 3. YouTube's data: people on a team read it; nobody writes it; strangers don't read it.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000009c1', 'oc@example.com') on conflict do nothing;
insert into profiles (id, email) values ('00000000-0000-4000-8000-0000000009c1', 'oc@example.com') on conflict do nothing;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  do $$ begin
    if (select count(*) from yt_videos where id = 'testvideo01') <> 1 then raise exception 'FAIL 3: a teammate should read videos'; end if;
    if not pg_temp.fails($q$update yt_videos set views = 1 where id = 'testvideo01'$q$) then raise exception 'FAIL 3: someone changed a video'; end if;
    if not pg_temp.fails($q$insert into yt_channels (id, title) values ('UCtesttesttesttesttest02', 'x')$q$) then raise exception 'FAIL 3: someone added a channel'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009c1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from yt_videos) <> 0 then raise exception 'FAIL 3: someone on no team reads videos'; end if;
  end $$;
commit;

-- 4. Tracking: masters and researchers; the editor can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a2');
  set local role authenticated;
  insert into outlier_tracked (team_id, channel_id) values ('10000000-0000-4000-8000-0000000009aa', 'UCtesttesttesttesttest01');
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$delete from outlier_tracked where team_id = '10000000-0000-4000-8000-0000000009aa' and channel_id = 'UCtesttesttesttesttest01' returning 1$q$) and (select count(*) from outlier_tracked where team_id = '10000000-0000-4000-8000-0000000009aa') = 0 then raise exception 'FAIL 4: an editor untracked'; end if;
    if not pg_temp.fails($q$insert into outlier_tracked (team_id, channel_id) values ('10000000-0000-4000-8000-0000000009aa', 'UCtesttesttesttesttest99')$q$) then raise exception 'FAIL 4: an editor tracked'; end if;
  end $$;
commit;
do $$ begin
  if (select count(*) from outlier_tracked where team_id = '10000000-0000-4000-8000-0000000009aa') <> 1 then raise exception 'FAIL 4: tracking should have stayed'; end if;
  if (select added_by from outlier_tracked where team_id = '10000000-0000-4000-8000-0000000009aa') <> '00000000-0000-4000-8000-0000000009a2' then raise exception 'FAIL 4: added_by not stamped'; end if;
end $$;

-- 5. Saving and folders: everyone on the team; another team's folder can't hold it; one save per folder.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  insert into outlier_folders (id, team_id, name) values ('40000000-0000-4000-8000-0000000009a1', '10000000-0000-4000-8000-0000000009aa', ' Ideas  for  June ');
  insert into outlier_saves (team_id, folder_id, kind, video_id, note) values ('10000000-0000-4000-8000-0000000009aa', '40000000-0000-4000-8000-0000000009a1', 'video', 'testvideo01', 'love this');
  insert into outlier_saves (team_id, kind, idea) values ('10000000-0000-4000-8000-0000000009aa', 'idea', '{"titles": ["A", "B"]}');
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_saves (team_id, folder_id, kind, video_id) values ('10000000-0000-4000-8000-0000000009aa', '40000000-0000-4000-8000-0000000009a1', 'video', 'testvideo01')$q$) then raise exception 'FAIL 5: saved twice in one folder'; end if;
    if not pg_temp.fails($q$insert into outlier_saves (team_id, kind) values ('10000000-0000-4000-8000-0000000009aa', 'video')$q$) then raise exception 'FAIL 5: a video save without a video'; end if;
  end $$;
commit;
do $$ begin
  if (select name from outlier_folders where id = '40000000-0000-4000-8000-0000000009a1') <> 'Ideas for June' then raise exception 'FAIL 5: folder name not tidied'; end if;
  if (select saved_by from outlier_saves where video_id = 'testvideo01') <> '00000000-0000-4000-8000-0000000009a3' then raise exception 'FAIL 5: saved_by not stamped'; end if;
end $$;
insert into outlier_folders (id, team_id, name) values ('40000000-0000-4000-8000-0000000009b1', '10000000-0000-4000-8000-0000000009bb', 'B folder');
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_saves (team_id, folder_id, kind, video_id) values ('10000000-0000-4000-8000-0000000009aa', '40000000-0000-4000-8000-0000000009b1', 'video', 'testvideo01')$q$) then raise exception 'FAIL 5: saved into another team''s folder'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009b1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from outlier_saves where team_id = '10000000-0000-4000-8000-0000000009aa') <> 0 then raise exception 'FAIL 5: another team sees saves'; end if;
    if not pg_temp.fails($q$insert into outlier_saves (team_id, kind, video_id) values ('10000000-0000-4000-8000-0000000009aa', 'video', 'testvideo01')$q$) then raise exception 'FAIL 5: saved into another team'; end if;
  end $$;
commit;
-- A folder: its maker or a master removes it (the researcher can't remove the editor's).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a2');
  set local role authenticated;
  delete from outlier_folders where id = '40000000-0000-4000-8000-0000000009a1';
commit;
do $$ begin
  if (select count(*) from outlier_folders where id = '40000000-0000-4000-8000-0000000009a1') <> 1 then raise exception 'FAIL 5: the researcher removed the editor''s folder'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  delete from outlier_folders where id = '40000000-0000-4000-8000-0000000009a1';
commit;
do $$ begin
  if (select count(*) from outlier_folders where id = '40000000-0000-4000-8000-0000000009a1') <> 0 then raise exception 'FAIL 5: the master should remove any folder'; end if;
  if (select folder_id from outlier_saves where video_id = 'testvideo01') is not null then raise exception 'FAIL 5: its saves should move to Unsorted'; end if;
end $$;

-- 6. Hidden ideas are each person's own.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  insert into outlier_dismissed (user_id, team_id, key) values ('00000000-0000-4000-8000-0000000009a3', '10000000-0000-4000-8000-0000000009aa', 'fake-vs-real|iphone');
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_dismissed (user_id, team_id, key) values ('00000000-0000-4000-8000-0000000009a1', '10000000-0000-4000-8000-0000000009aa', 'x')$q$) then raise exception 'FAIL 6: hid an idea for someone else'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from outlier_dismissed) <> 0 then raise exception 'FAIL 6: sees someone else''s hidden ideas'; end if;
  end $$;
commit;

-- 7. Alerts: masters set them; the researcher reads but can't change them; the server's own column stays its own.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  insert into outlier_settings (team_id, alert_min, alert_to, watch_words) values ('10000000-0000-4000-8000-0000000009aa', 8, 'everyone', array[' Fake ', 'fake', 'scam']);
  do $$ begin
    if not pg_temp.fails($q$update outlier_settings set digest_sent_on = current_date where team_id = '10000000-0000-4000-8000-0000000009aa'$q$) then raise exception 'FAIL 7: a master wrote the server''s column'; end if;
  end $$;
commit;
do $$ begin
  if (select array_length(watch_words, 1) from outlier_settings where team_id = '10000000-0000-4000-8000-0000000009aa') <> 2 then raise exception 'FAIL 7: watch words not tidied'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a2');
  set local role authenticated;
  update outlier_settings set alert_min = 2 where team_id = '10000000-0000-4000-8000-0000000009aa';
  do $$ begin
    if (select alert_min from outlier_settings where team_id = '10000000-0000-4000-8000-0000000009aa') <> 8 then raise exception 'FAIL 7: the researcher changed the alerts'; end if;
  end $$;
commit;

-- 8. The server's own tables: nobody else, even on the team.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  do $$ begin
    if not pg_temp.fails($q$select * from outlier_quota$q$) then raise exception 'FAIL 8: read the quota'; end if;
    if not pg_temp.fails($q$select * from outlier_search_cache$q$) then raise exception 'FAIL 8: read the search cache'; end if;
    if not pg_temp.fails($q$select outlier_take('search', 1, 100)$q$) then raise exception 'FAIL 8: took from the budget'; end if;
    if not pg_temp.fails($q$select outliers_purge(30)$q$) then raise exception 'FAIL 8: purged'; end if;
  end $$;
commit;

-- 9. The budget: never past the cap, all or nothing.
do $$ begin
  if outlier_take('units', 5, 7) <> 2 then raise exception 'FAIL 9: take 5 of 7'; end if;
  if outlier_take('units', 3, 7) <> -1 then raise exception 'FAIL 9: 3 more would pass 7'; end if;
  if outlier_take('units', 2, 7) <> 0 then raise exception 'FAIL 9: exactly to the cap'; end if;
  if outlier_lock('t', 30) is not true or outlier_lock('t', 30) is not false then raise exception 'FAIL 9: the lock'; end if;
  perform outlier_unlock('t');
  if outlier_lock('t', 30) is not true then raise exception 'FAIL 9: the lock after unlocking'; end if;
end $$;

-- 10. At most 12 niches a team.
do $$
declare i int;
begin
  for i in 2..12 loop
    insert into outlier_niches (team_id, name) values ('10000000-0000-4000-8000-0000000009aa', 'N' || i);
  end loop;
  if not pg_temp.fails($q$insert into outlier_niches (team_id, name) values ('10000000-0000-4000-8000-0000000009aa', 'N13')$q$) then raise exception 'FAIL 10: a 13th niche'; end if;
end $$;

-- 11. YouTube's 30 days.
update yt_videos set fetched_at = now() - interval '31 days' where id = 'testvideo01';
select outliers_purge(30);
do $$ begin
  if (select count(*) from yt_videos where id = 'testvideo01') <> 0 then raise exception 'FAIL 11: an old video stayed'; end if;
  if (select count(*) from outlier_saves where video_id = 'testvideo01') <> 1 then raise exception 'FAIL 11: the save should stay (its data is read again)'; end if;
end $$;

-- 12. An idea started as a video: the save remembers it, only inside one team, and only through outliers_link_idea.
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('40000000-0000-4000-8000-0000000009a1', '10000000-0000-4000-8000-0000000009aa', 'From an idea', 'ideate', '00000000-0000-4000-8000-0000000009a1'),
  ('40000000-0000-4000-8000-0000000009b1', '10000000-0000-4000-8000-0000000009bb', 'Team B video', 'ideate', '00000000-0000-4000-8000-0000000009b1')
on conflict do nothing;
insert into outlier_saves (id, team_id, kind, idea) values ('50000000-0000-4000-8000-0000000009a1', '10000000-0000-4000-8000-0000000009aa', 'idea', '{"titles": ["A title"]}') on conflict do nothing;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009b1');
  set local role authenticated;
  select outliers_link_idea('50000000-0000-4000-8000-0000000009a1', '40000000-0000-4000-8000-0000000009b1', null);
commit;
do $$ begin
  if (select project_id from outlier_saves where id = '50000000-0000-4000-8000-0000000009a1') is not null then raise exception 'FAIL 12: another team linked the idea'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a3');
  set local role authenticated;
  select outliers_link_idea('50000000-0000-4000-8000-0000000009a1', '40000000-0000-4000-8000-0000000009b1', null);
  do $$ begin
    if not pg_temp.fails($q$update outlier_saves set project_id = '40000000-0000-4000-8000-0000000009a1' where id = '50000000-0000-4000-8000-0000000009a1'$q$) then raise exception 'FAIL 12: set project_id directly'; end if;
  end $$;
commit;
do $$ begin
  if (select project_id from outlier_saves where id = '50000000-0000-4000-8000-0000000009a1') is not null then raise exception 'FAIL 12: linked to another team''s video'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000009a1');
  set local role authenticated;
  select outliers_link_idea('50000000-0000-4000-8000-0000000009a1', '40000000-0000-4000-8000-0000000009a1', null);
commit;
do $$ begin
  if (select project_id from outlier_saves where id = '50000000-0000-4000-8000-0000000009a1') is distinct from '40000000-0000-4000-8000-0000000009a1' then raise exception 'FAIL 12: the idea wasn''t linked'; end if;
end $$;
