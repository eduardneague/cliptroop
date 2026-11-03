-- Checks for 0094 (Outliers: which channels count, hidden channels, the
-- viewers list): a niche's own channels always count, found ones only when
-- they fit (and the niche takes found ones), never one the team hid or took
-- out; made-for-kids videos only where a niche takes them; who may hide a
-- channel and who sees the viewers list. Run by
-- scripts/db/test-from-scratch.sh on the database the migrations just built;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team A, E = editor in A, O = master of team B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000fa1', 'fm@example.com'),
  ('00000000-0000-4000-8000-000000000fa3', 'fe@example.com'),
  ('00000000-0000-4000-8000-000000000fb1', 'fo@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000000fa1', 'fm@example.com'),
  ('00000000-0000-4000-8000-000000000fa3', 'fe@example.com'),
  ('00000000-0000-4000-8000-000000000fb1', 'fo@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-000000000faa', 'Fit A', 'fit-a', '00000000-0000-4000-8000-000000000fa1'),
  ('10000000-0000-4000-8000-000000000fbb', 'Fit B', 'fit-b', '00000000-0000-4000-8000-000000000fb1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-000000000fa3', '10000000-0000-4000-8000-000000000faa', '00000000-0000-4000-8000-000000000fa3', 'fe@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values ('20000000-0000-4000-8000-000000000fa3', 'editor') on conflict do nothing;

-- Five channels: G (picked by the team), F (found, fits), L (found, another language),
-- K (found, fits, but posts for kids), X (found, fits, then hidden by the team).
insert into yt_channels (id, title, subscribers, long_median, scanned_at) values
  ('UCfitgroupfitgroupfitgr1', 'Group channel', 900000, 100000, now()),
  ('UCfitfoundfitfoundfitfo1', 'Found channel', 500000, 50000, now()),
  ('UCfitlangsfitlangsfitla1', 'Other language channel', 2000000, 80000, now()),
  ('UCfitkidskfitkidskfitki1', 'Kids channel', 3000000, 90000, now()),
  ('UCfithiddefithiddefithi1', 'Hidden channel', 400000, 40000, now())
on conflict do nothing;
insert into yt_videos (id, channel_id, title, published_at, kind, views, score, kids) values
  ('fitvideo0g1', 'UCfitgroupfitgroupfitgr1', 'I tested every phone', now() - interval '3 days', 'long', 900000, 9, false),
  ('fitvideo0f1', 'UCfitfoundfitfoundfitfo1', 'The best phone of the year', now() - interval '4 days', 'long', 300000, 6, false),
  ('fitvideo0l1', 'UCfitlangsfitlangsfitla1', 'Sabse sasta phone kaun sa hai', now() - interval '2 days', 'long', 800000, 10, false),
  ('fitvideo0k1', 'UCfitkidskfitkidskfitki1', 'Phone songs for toddlers', now() - interval '2 days', 'long', 5000000, 50, true),
  ('fitvideo0x1', 'UCfithiddefithiddefithi1', 'This phone is a scam', now() - interval '1 day', 'long', 200000, 5, false)
on conflict do nothing;
insert into outlier_niches (id, team_id, name, keywords) values ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'Phones', array['phone review']) on conflict do nothing;
insert into outlier_niche_channels (niche_id, team_id, channel_id, source, relevance, verdict, rel_v) values
  ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'UCfitgroupfitgroupfitgr1', 'manual', null, null, 0),
  ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'UCfitfoundfitfoundfitfo1', 'search', 0.9, 'ok', 2),
  ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'UCfitlangsfitlangsfitla1', 'search', 0.5, 'lang', 2),
  ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'UCfitkidskfitkidskfitki1', 'search', 0.8, 'ok', 2),
  ('30000000-0000-4000-8000-000000000fa1', '10000000-0000-4000-8000-000000000faa', 'UCfithiddefithiddefithi1', 'search', 0.8, 'ok', 2)
on conflict do nothing;

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
create or replace function pg_temp.vids(p_f jsonb default '{}') returns text[] language sql as $$
  select coalesce(array_agg(v.id order by v.id), '{}') from outliers_videos('10000000-0000-4000-8000-000000000faa', '30000000-0000-4000-8000-000000000fa1', p_f, 'score', 50, 0) v;
$$;
create or replace function pg_temp.chans(p_only text) returns text[] language sql as $$
  select coalesce(array_agg(c.id order by c.id), '{}') from outliers_channels('10000000-0000-4000-8000-000000000faa', '30000000-0000-4000-8000-000000000fa1', jsonb_build_object('only', p_only), 'rate', 50, 0) c;
$$;

-- 1. The channels that count: the team's own and the found ones that fit; not another language; kids' videos stay out.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  do $$ begin
    if pg_temp.vids() <> array['fitvideo0f1', 'fitvideo0g1', 'fitvideo0x1'] then raise exception 'FAIL 1: videos that count are %', pg_temp.vids(); end if;
    if pg_temp.chans('all') <> array['UCfitfoundfitfoundfitfo1', 'UCfitgroupfitgroupfitgr1', 'UCfithiddefithiddefithi1', 'UCfitkidskfitkidskfitki1'] then raise exception 'FAIL 1: channels that count are %', pg_temp.chans('all'); end if;
    if pg_temp.chans('group') <> array['UCfitgroupfitgroupfitgr1'] then raise exception 'FAIL 1: own channels are %', pg_temp.chans('group'); end if;
    if pg_temp.chans('out') <> array['UCfitlangsfitlangsfitla1'] then raise exception 'FAIL 1: left out are %', pg_temp.chans('out'); end if;
    if (select verdict from outliers_channels('10000000-0000-4000-8000-000000000faa', '30000000-0000-4000-8000-000000000fa1', '{"only":"out"}', 'rate', 50, 0)) <> 'lang' then raise exception 'FAIL 1: why it is left out'; end if;
    if (select count(*) from outliers_channels('10000000-0000-4000-8000-000000000faa', '30000000-0000-4000-8000-000000000fa1', '{"only":"group"}', 'rate', 50, 0) where grp and counted) <> 1 then raise exception 'FAIL 1: own channel flags'; end if;
  end $$;
commit;
do $$
declare o jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000fa1', false);
  o := outliers_overview('10000000-0000-4000-8000-000000000faa');
  if (o->'niches'->0->>'group_n')::int <> 1 or (o->'niches'->0->>'found_n')::int <> 3 or (o->'niches'->0->>'out_n')::int <> 1 then raise exception 'FAIL 1: overview counts %', o->'niches'->0; end if;
  if (o->'niches'->0->>'only_group')::boolean is not false then raise exception 'FAIL 1: overview only_group'; end if;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- 2. A niche that takes kids' videos shows them; "only these channels" leaves the found ones out.
update outlier_niches set kids = true where id = '30000000-0000-4000-8000-000000000fa1';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  do $$ begin
    if not ('fitvideo0k1' = any(pg_temp.vids())) then raise exception 'FAIL 2: a niche that takes kids videos should show them'; end if;
  end $$;
commit;
update outlier_niches set kids = false, only_group = true where id = '30000000-0000-4000-8000-000000000fa1';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  do $$ begin
    if pg_temp.vids() <> array['fitvideo0g1'] then raise exception 'FAIL 2: only its own channels, got %', pg_temp.vids(); end if;
    if pg_temp.chans('all') <> array['UCfitgroupfitgroupfitgr1'] then raise exception 'FAIL 2: only its own channels count, got %', pg_temp.chans('all'); end if;
  end $$;
commit;
update outlier_niches set only_group = false where id = '30000000-0000-4000-8000-000000000fa1';

-- 3. Hiding a channel: anyone on the team (stamped, tidied); it leaves every list but its own page; another team can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  insert into outlier_blocked (team_id, channel_id, title) values ('10000000-0000-4000-8000-000000000faa', 'UCfithiddefithiddefithi1', '  Hidden channel  ');
  do $$ begin
    if not pg_temp.fails($q$insert into outlier_blocked (team_id, channel_id, added_by) values ('10000000-0000-4000-8000-000000000faa', 'UCfitfoundfitfoundfitfo1', '00000000-0000-4000-8000-000000000fb1')$q$) then raise exception 'FAIL 3: someone set who hid it'; end if;
  end $$;
  do $$ begin
    if 'fitvideo0x1' = any(pg_temp.vids()) then raise exception 'FAIL 3: a hidden channel''s video still shows'; end if;
    if 'UCfithiddefithiddefithi1' = any(pg_temp.chans('all')) then raise exception 'FAIL 3: a hidden channel is still listed'; end if;
    if (select count(*) from outliers_videos('10000000-0000-4000-8000-000000000faa', null, '{"channel":"UCfithiddefithiddefithi1"}', 'score', 10, 0)) <> 1 then raise exception 'FAIL 3: its own page should still show its videos'; end if;
    if (select count(*) from outliers_channels('10000000-0000-4000-8000-000000000faa', null, '{"only":"blocked"}', 'rate', 10, 0) where blocked) <> 1 then raise exception 'FAIL 3: the hidden list'; end if;
  end $$;
commit;
do $$ begin
  if (select added_by from outlier_blocked where channel_id = 'UCfithiddefithiddefithi1') <> '00000000-0000-4000-8000-000000000fa3' then raise exception 'FAIL 3: added_by not stamped'; end if;
  if (select title from outlier_blocked where channel_id = 'UCfithiddefithiddefithi1') <> 'Hidden channel' then raise exception 'FAIL 3: title not tidied'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fb1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from outlier_blocked where team_id = '10000000-0000-4000-8000-000000000faa') <> 0 then raise exception 'FAIL 3: another team sees the hidden list'; end if;
    if not pg_temp.fails($q$insert into outlier_blocked (team_id, channel_id) values ('10000000-0000-4000-8000-000000000faa', 'UCfitfoundfitfoundfitfo1')$q$) then raise exception 'FAIL 3: another team hid a channel'; end if;
    delete from outlier_blocked where team_id = '10000000-0000-4000-8000-000000000faa';
  end $$;
commit;
do $$ begin
  if (select count(*) from outlier_blocked where team_id = '10000000-0000-4000-8000-000000000faa') <> 1 then raise exception 'FAIL 3: another team brought a channel back'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  delete from outlier_blocked where team_id = '10000000-0000-4000-8000-000000000faa' and channel_id = 'UCfithiddefithiddefithi1';
commit;
do $$ begin
  if exists (select 1 from outlier_blocked where team_id = '10000000-0000-4000-8000-000000000faa') then raise exception 'FAIL 3: a teammate couldn''t bring it back'; end if;
end $$;

-- 4. The viewers list: the server writes it, teammates read it, nobody else does.
insert into outlier_audience (team_id, channel_id, views, videos, ours, top) values ('10000000-0000-4000-8000-000000000faa', 'UCfitfoundfitfoundfitfo1', 12000, 3, 2, array['fitvideo0f1']) on conflict do nothing;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  do $$ begin
    if jsonb_array_length(outliers_audience('10000000-0000-4000-8000-000000000faa')->'rows') <> 1 then raise exception 'FAIL 4: a teammate should see the viewers list'; end if;
    if not pg_temp.fails($q$insert into outlier_audience (team_id, channel_id) values ('10000000-0000-4000-8000-000000000faa', 'UCfitgroupfitgroupfitgr1')$q$) then raise exception 'FAIL 4: someone wrote the viewers list'; end if;
    if (select count(*) from outliers_videos('10000000-0000-4000-8000-000000000faa', null, '{"scope":"audience"}', 'score', 10, 0)) <> 1 then raise exception 'FAIL 4: their outliers'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fb1');
  set local role authenticated;
  do $$ begin
    if outliers_audience('10000000-0000-4000-8000-000000000faa') is not null then raise exception 'FAIL 4: another team read the viewers list'; end if;
    if (select count(*) from outlier_audience) <> 0 then raise exception 'FAIL 4: another team sees the rows'; end if;
  end $$;
commit;

-- 5. What a niche's languages and countries can hold, and the new source.
do $$ begin
  if not pg_temp.fails($q$update outlier_niches set langs = array['english'] where id = '30000000-0000-4000-8000-000000000fa1'$q$) then raise exception 'FAIL 5: a language must be two letters'; end if;
  if not pg_temp.fails($q$update outlier_niches set regions = array['us'] where id = '30000000-0000-4000-8000-000000000fa1'$q$) then raise exception 'FAIL 5: a country must be two capitals'; end if;
  update outlier_niches set langs = array['en'], regions = array['US', 'GB'] where id = '30000000-0000-4000-8000-000000000fa1';
  update outlier_niches set langs = '{}' where id = '30000000-0000-4000-8000-000000000fa1';
  if pg_temp.fails($q$update outlier_niche_channels set source = 'audience' where channel_id = 'UCfitfoundfitfoundfitfo1'$q$) then raise exception 'FAIL 5: audience is a source now'; end if;
  if not pg_temp.fails($q$update outlier_niche_channels set verdict = 'maybe' where channel_id = 'UCfitfoundfitfoundfitfo1'$q$) then raise exception 'FAIL 5: an unknown verdict went in'; end if;
end $$;

-- 6. Editors can't change a niche's choices; masters can.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa3');
  set local role authenticated;
  update outlier_niches set only_group = true where id = '30000000-0000-4000-8000-000000000fa1';
commit;
do $$ begin
  if (select only_group from outlier_niches where id = '30000000-0000-4000-8000-000000000fa1') then raise exception 'FAIL 6: an editor changed the niche'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-000000000fa1');
  set local role authenticated;
  update outlier_niches set only_group = true, kids = true where id = '30000000-0000-4000-8000-000000000fa1';
commit;
do $$ begin
  if not (select only_group and kids from outlier_niches where id = '30000000-0000-4000-8000-000000000fa1') then raise exception 'FAIL 6: a master couldn''t change the niche'; end if;
end $$;

select 'outliers-fit checks passed' as ok;
