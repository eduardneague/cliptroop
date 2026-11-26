-- Checks for 0136: Sponsorships. Each one is an affiliate, a review, a paid deal or several (kept in that order, no
-- repeats, never none, never anything else); the ones from before are affiliates. A video only on the channel can be
-- linked when the team's channel lists it (YouTube, this team), never with a project in the same place, and stays
-- linked if it leaves the channel. A picture is https, says where it came from, and changing it alone isn't an edit;
-- an editor can't change it. A new product link lets the server look again. The server's background look takes the
-- ones that need a picture once (not a taken-away one, not one looked at this week, not another team's), and keeps
-- what it found only for the link it looked at and only where nobody chose meanwhile. Nobody signed in reaches the
-- background functions.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). G: editor M lets in. E: editor. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000136a1', 'm136@example.com'),
  ('00000000-0000-4000-8000-0000000136a2', 'g136@example.com'),
  ('00000000-0000-4000-8000-0000000136a3', 'e136@example.com'),
  ('00000000-0000-4000-8000-0000000136b1', 'x136@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%136@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000136a0', 'Team 136', 'team-136', '00000000-0000-4000-8000-0000000136a1'),
  ('10000000-0000-4000-8000-0000000136b0', 'Other 136', 'other-136', '00000000-0000-4000-8000-0000000136b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000136a2', '10000000-0000-4000-8000-0000000136a0', '00000000-0000-4000-8000-0000000136a2', 'g136@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000136a3', '10000000-0000-4000-8000-0000000136a0', '00000000-0000-4000-8000-0000000136a3', 'e136@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000136a2', 'editor'),
  ('30000000-0000-4000-8000-0000000136a3', 'editor')
on conflict do nothing;
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('40000000-0000-4000-8000-0000000136a1', '10000000-0000-4000-8000-0000000136a0', 'Keyboard review', 'publish', '00000000-0000-4000-8000-0000000136a1')
on conflict do nothing;
-- The channels' videos, as the analytics copy keeps them.
insert into analytics_content (team_id, platform, external_id, kind, title) values
  ('10000000-0000-4000-8000-0000000136a0', 'youtube', 'Long136_aaa', 'long', 'Old controller review'),
  ('10000000-0000-4000-8000-0000000136a0', 'youtube', 'Short136_bb', 'short', 'Controller in 20 seconds'),
  ('10000000-0000-4000-8000-0000000136a0', 'tiktok', 'Tiktok136_c', 'short', 'On TikTok'),
  ('10000000-0000-4000-8000-0000000136b0', 'youtube', 'Their136_dd', 'long', 'Their video')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- M lets G in.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000136a0', '00000000-0000-4000-8000-0000000136a2');
commit;

-- 0. Who reaches what.
do $$ begin
  if has_function_privilege('authenticated', 'affiliate_pictures_claim(uuid, uuid[], integer)', 'execute')
     or has_function_privilege('anon', 'affiliate_pictures_claim(uuid, uuid[], integer)', 'execute') then
    raise exception 'FAIL 0: a signed-in request may take the background look''s work';
  end if;
  if has_function_privilege('authenticated', 'affiliate_picture_found(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'affiliate_picture_found(uuid, text, text)', 'execute') then
    raise exception 'FAIL 0: a signed-in request may set a "found" picture';
  end if;
  if has_function_privilege('authenticated', 'sponsorships_ready()', 'execute') then raise exception 'FAIL 0: anyone signed in may ask sponsorships_ready()'; end if;
  if not sponsorships_ready() then raise exception 'FAIL 0: sponsorships_ready() says no'; end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'affiliates' and column_name = 'kinds') not like '%affiliate%' then
    raise exception 'FAIL 0: the ones from before aren''t affiliates';
  end if;
end $$;

-- 1. What kind of deal: kept in order without repeats; never none, never anything else.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  insert into affiliates (id, team_id, name, product_url, kinds)
  values ('20000000-0000-4000-8000-0000000136a1', '10000000-0000-4000-8000-0000000136a0', 'Deepcool.com', 'https://www.deepcool.com/products/lq360-ultra', array['review', 'affiliate', 'review']);
  insert into affiliates (id, team_id, name, product_url)
  values ('20000000-0000-4000-8000-0000000136a2', '10000000-0000-4000-8000-0000000136a0', 'Gravastar.com', 'https://www.gravastar.com/products/mercury-k98');
  do $$ begin
    if (select kinds from affiliates where id = '20000000-0000-4000-8000-0000000136a1') <> array['affiliate', 'review'] then
      raise exception 'FAIL 1: the kinds aren''t kept in order without repeats (%)', (select kinds from affiliates where id = '20000000-0000-4000-8000-0000000136a1');
    end if;
    if (select kinds from affiliates where id = '20000000-0000-4000-8000-0000000136a2') <> array['affiliate'] then raise exception 'FAIL 1: a new one isn''t an affiliate'; end if;
    begin
      insert into affiliates (team_id, name, kinds) values ('10000000-0000-4000-8000-0000000136a0', 'No kind', '{}');
      raise exception 'FAIL 1: a deal of no kind was kept';
    exception when check_violation then null;
    end;
    begin
      insert into affiliates (team_id, name, kinds) values ('10000000-0000-4000-8000-0000000136a0', 'Odd kind', array['barter']);
      raise exception 'FAIL 1: an unknown kind was kept';
    exception when check_violation then null;
    end;
    begin
      update affiliates set kinds = null where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 1: the kinds were taken away';
    exception when check_violation or not_null_violation then null;
    end;
  end $$;
  update affiliates set kinds = array['paid', 'review'] where id = '20000000-0000-4000-8000-0000000136a2';
  do $$ begin
    if (select kinds from affiliates where id = '20000000-0000-4000-8000-0000000136a2') <> array['review', 'paid'] then raise exception 'FAIL 1: changing the kinds'; end if;
  end $$;
  update affiliates set kinds = array['affiliate'] where id = '20000000-0000-4000-8000-0000000136a2';
commit;

-- 2. A video only on the channel: this team's YouTube channel lists it; never with a project in the same place.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  update affiliates set long_youtube_id = 'Long136_aaa', short_youtube_id = 'Short136_bb' where id = '20000000-0000-4000-8000-0000000136a1';
  do $$ begin
    if not exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000136a1' and long_youtube_id = 'Long136_aaa' and short_youtube_id = 'Short136_bb') then
      raise exception 'FAIL 2: the channel''s videos weren''t linked';
    end if;
    begin
      update affiliates set long_youtube_id = 'Their136_dd' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 2: another team''s video was linked';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliates set short_youtube_id = 'Tiktok136_c' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 2: a TikTok was linked as a YouTube video';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliates set long_youtube_id = 'Nowhere1234' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 2: a video the channel doesn''t list was linked';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliates set project_id = '40000000-0000-4000-8000-0000000136a1' where id = '20000000-0000-4000-8000-0000000136a1';
      raise exception 'FAIL 2: a project and a channel video in the same place';
    exception when check_violation then null;
    end;
  end $$;
commit;
do $$ begin
  begin
    insert into affiliates (team_id, name, short_youtube_id) values ('10000000-0000-4000-8000-0000000136a0', 'Bad id', 'not an id!');
    raise exception 'FAIL 2: a malformed video id was kept';
  exception when check_violation or insufficient_privilege then null;
  end;
end $$;
-- The video leaves the channel (the analytics copy forgets it): the sponsorship keeps it and can still be changed.
delete from analytics_content where team_id = '10000000-0000-4000-8000-0000000136a0' and external_id = 'Long136_aaa';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  update affiliates set notes = 'Still here' where id = '20000000-0000-4000-8000-0000000136a1';
commit;
do $$ begin
  if not exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000136a1' and long_youtube_id = 'Long136_aaa' and notes = 'Still here') then
    raise exception 'FAIL 2: a video gone from the channel blocked an edit';
  end if;
end $$;

-- 3. The picture: https, says where it came from; changing it alone isn't an edit; an editor can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  do $$ begin
    begin
      update affiliates set image_url = 'http://shop.example.com/p.jpg', image_source = 'link' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 3: a picture not on https was kept';
    exception when check_violation then null;
    end;
    begin
      update affiliates set image_url = 'javascript:alert(1)', image_source = 'link' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 3: a script was kept as a picture';
    exception when check_violation then null;
    end;
    begin
      update affiliates set image_source = 'page' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 3: a found picture without its address';
    exception when check_violation then null;
    end;
    begin
      update affiliates set image_url = 'https://shop.example.com/p.jpg' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 3: a picture without where it came from';
    exception when check_violation then null;
    end;
    begin
      update affiliates set image_url = 'https://shop.example.com/p.jpg', image_source = 'none' where id = '20000000-0000-4000-8000-0000000136a2';
      raise exception 'FAIL 3: a taken-away picture with an address';
    exception when check_violation then null;
    end;
  end $$;
commit;
create temp table before136 as select id, updated_by, updated_at from affiliates where team_id = '10000000-0000-4000-8000-0000000136a0';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a2');
  set local role authenticated;
  update affiliates set image_url = 'https://shop.example.com/k98.jpg', image_source = 'link' where id = '20000000-0000-4000-8000-0000000136a2';
commit;
do $$ begin
  if not exists (
    select 1 from affiliates a join before136 b using (id)
    where a.id = '20000000-0000-4000-8000-0000000136a2' and a.image_url = 'https://shop.example.com/k98.jpg' and a.image_source = 'link'
      and a.updated_by is not distinct from b.updated_by and a.updated_at = b.updated_at
  ) then
    raise exception 'FAIL 3: a new picture wasn''t kept, or counted as an edit';
  end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a3');
  set local role authenticated;
  do $$ declare n int; begin
    update affiliates set image_url = 'https://elsewhere.example.com/x.jpg', image_source = 'link' where id = '20000000-0000-4000-8000-0000000136a2';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 3: an editor changed a picture'; end if;
  end $$;
rollback;
-- Another product link: the server may look again.
update affiliates set image_checked_at = now() where id = '20000000-0000-4000-8000-0000000136a1';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  update affiliates set product_url = 'https://www.deepcool.com/products/lq360' where id = '20000000-0000-4000-8000-0000000136a1';
commit;
do $$ begin
  if (select image_checked_at from affiliates where id = '20000000-0000-4000-8000-0000000136a1') is not null then raise exception 'FAIL 3: a new product link isn''t looked at again'; end if;
end $$;

-- 4. The background look.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136a1');
  set local role authenticated;
  insert into affiliates (id, team_id, name, product_url, image_source) values ('20000000-0000-4000-8000-0000000136a3', '10000000-0000-4000-8000-0000000136a0', 'Arzopa', 'https://s.click.aliexpress.com/e/_x', 'none');
  insert into affiliates (id, team_id, name) values ('20000000-0000-4000-8000-0000000136a4', '10000000-0000-4000-8000-0000000136a0', 'No link');
  insert into affiliates (id, team_id, name, product_url) values ('20000000-0000-4000-8000-0000000136a5', '10000000-0000-4000-8000-0000000136a0', 'Yunzii', 'https://yunzii.example.com/discount/v');
  insert into affiliates (id, team_id, name, product_url) values ('20000000-0000-4000-8000-0000000136a6', '10000000-0000-4000-8000-0000000136a0', 'Promeed', 'https://promeed.example.com/p');
commit;
update affiliates set image_checked_at = now() - interval '2 days' where id = '20000000-0000-4000-8000-0000000136a5';
update affiliates set image_checked_at = now() - interval '8 days' where id = '20000000-0000-4000-8000-0000000136a6';
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000136b1');
  set local role authenticated;
  insert into affiliates (id, team_id, name, product_url) values ('20000000-0000-4000-8000-0000000136b1', '10000000-0000-4000-8000-0000000136b0', 'Theirs', 'https://theirs.example.com/p');
commit;
drop table before136;
create temp table before136 as select id, updated_by, updated_at from affiliates where team_id = '10000000-0000-4000-8000-0000000136a0';
begin;
  set local role service_role;
  do $$ declare ids uuid[]; again int; begin
    select array_agg(c.id order by c.id) into ids from affiliate_pictures_claim('10000000-0000-4000-8000-0000000136a0', null, 10) c;
    if ids is distinct from array['20000000-0000-4000-8000-0000000136a1', '20000000-0000-4000-8000-0000000136a6']::uuid[] then
      raise exception 'FAIL 4: the look took the wrong ones (%)', ids;
    end if;
    select count(*) into again from affiliate_pictures_claim('10000000-0000-4000-8000-0000000136a0', null, 10);
    if again <> 0 then raise exception 'FAIL 4: the same ones were taken twice'; end if;
    if not affiliate_picture_found('20000000-0000-4000-8000-0000000136a1', 'https://www.deepcool.com/products/lq360', 'https://www.deepcool.com/img/lq360.png') then
      raise exception 'FAIL 4: a found picture wasn''t kept';
    end if;
    if affiliate_picture_found('20000000-0000-4000-8000-0000000136a6', 'https://promeed.example.com/OTHER', 'https://promeed.example.com/x.jpg') then
      raise exception 'FAIL 4: a picture for a link that changed meanwhile was kept';
    end if;
    if affiliate_picture_found('20000000-0000-4000-8000-0000000136a3', 'https://s.click.aliexpress.com/e/_x', 'https://ae01.example.com/x.jpg') then
      raise exception 'FAIL 4: a picture someone took away came back';
    end if;
    if affiliate_picture_found('20000000-0000-4000-8000-0000000136a2', 'https://www.gravastar.com/products/mercury-k98', 'https://x.example.com/y.jpg') then
      raise exception 'FAIL 4: a chosen picture was replaced';
    end if;
    begin
      perform affiliate_picture_found('20000000-0000-4000-8000-0000000136a6', 'https://promeed.example.com/p', 'http://insecure.example.com/x.jpg');
      raise exception 'FAIL 4: a picture not on https was kept';
    exception when check_violation then null;
    end;
  end $$;
commit;
do $$ begin
  if not exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000136a1' and image_url = 'https://www.deepcool.com/img/lq360.png' and image_source = 'page') then
    raise exception 'FAIL 4: the found picture isn''t there';
  end if;
  if exists (
    select 1 from affiliates a join before136 b using (id)
    where a.updated_by is distinct from b.updated_by or a.updated_at <> b.updated_at
  ) then
    raise exception 'FAIL 4: the background look counted as an edit';
  end if;
  if (select image_checked_at from affiliates where id = '20000000-0000-4000-8000-0000000136b1') is not null then raise exception 'FAIL 4: another team''s was looked at'; end if;
end $$;
-- One asked for by id (a new one, just saved): only it.
update affiliates set image_checked_at = null where id in ('20000000-0000-4000-8000-0000000136a5', '20000000-0000-4000-8000-0000000136a6');
begin;
  set local role service_role;
  do $$ declare ids uuid[]; begin
    select array_agg(c.id) into ids from affiliate_pictures_claim('10000000-0000-4000-8000-0000000136a0', array['20000000-0000-4000-8000-0000000136a5']::uuid[], 10) c;
    if ids is distinct from array['20000000-0000-4000-8000-0000000136a5']::uuid[] then raise exception 'FAIL 4: asking for one took others (%)', ids; end if;
  end $$;
commit;

-- 5. Done: the teams and the people go.
drop table before136;
delete from teams where id in ('10000000-0000-4000-8000-0000000136a0', '10000000-0000-4000-8000-0000000136b0');
delete from profiles where email like '%136@example.com';
delete from auth.users where email like '%136@example.com';
