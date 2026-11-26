-- Checks for 0137: Sponsorships as companies with products. The rows from before become companies (one per brand: the
-- first word of the name, two after "The"; never two with logins or two affiliate platforms together; the one with a
-- login kept, so its login still opens; the code most of them had), their products under them, keeping their own
-- type, status, picture, videos and notes, and their own code only where it wasn't the company's; once. Products: the team reads them, the people who change sponsorships change them, an editor
-- and another team can't; a product stays in its team; its type in order, its own code only when it says so; its
-- videos the team's; verified or not stamped by the database, cleared by another link or code (the company's code
-- too, for the ones using it), kept otherwise; the picture look on products. Nobody signed in reaches the functions.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- M: master (owner). G: editor M lets in. E: editor. X: master of another team.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000137a1', 'm137@example.com'),
  ('00000000-0000-4000-8000-0000000137a2', 'g137@example.com'),
  ('00000000-0000-4000-8000-0000000137a3', 'e137@example.com'),
  ('00000000-0000-4000-8000-0000000137b1', 'x137@example.com')
on conflict do nothing;
insert into profiles (id, email)
select id, email from auth.users where email like '%137@example.com'
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000137a0', 'Team 137', 'team-137', '00000000-0000-4000-8000-0000000137a1'),
  ('10000000-0000-4000-8000-0000000137b0', 'Other 137', 'other-137', '00000000-0000-4000-8000-0000000137b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-0000000137a2', '10000000-0000-4000-8000-0000000137a0', '00000000-0000-4000-8000-0000000137a2', 'g137@example.com', 'active'),
  ('30000000-0000-4000-8000-0000000137a3', '10000000-0000-4000-8000-0000000137a0', '00000000-0000-4000-8000-0000000137a3', 'e137@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-0000000137a2', 'editor'),
  ('30000000-0000-4000-8000-0000000137a3', 'editor')
on conflict do nothing;
insert into long_video_projects (id, team_id, title, stage, created_by) values
  ('40000000-0000-4000-8000-0000000137a1', '10000000-0000-4000-8000-0000000137a0', 'Keyboard review', 'publish', '00000000-0000-4000-8000-0000000137a1'),
  ('40000000-0000-4000-8000-0000000137b1', '10000000-0000-4000-8000-0000000137b0', 'Their video', 'ideate', '00000000-0000-4000-8000-0000000137b1')
on conflict do nothing;
insert into analytics_content (team_id, platform, external_id, kind, title) values
  ('10000000-0000-4000-8000-0000000137a0', 'youtube', 'Long137_aaa', 'long', 'Old controller review'),
  ('10000000-0000-4000-8000-0000000137b0', 'youtube', 'Their137_dd', 'long', 'Their video')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
create or replace function pg_temp.sealed(n int) returns text language sql as $$
  select 'av1.' || repeat('A', 16) || '.' || repeat('B', 22) || '.' || repeat('C', 20 + n);
$$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a1');
  set local role authenticated;
  insert into affiliate_access (team_id, user_id) values ('10000000-0000-4000-8000-0000000137a0', '00000000-0000-4000-8000-0000000137a2');
commit;

-- 0. Who reaches what.
do $$ begin
  if has_function_privilege('authenticated', 'affiliates_group_into_companies()', 'execute') or has_function_privilege('service_role', 'affiliates_group_into_companies()', 'execute') then
    raise exception 'FAIL 0: someone other than the database''s owner may regroup the companies';
  end if;
  if has_function_privilege('authenticated', 'affiliate_product_pictures_claim(uuid, uuid[], integer)', 'execute') or has_function_privilege('authenticated', 'affiliate_product_picture_found(uuid, text, text)', 'execute') then
    raise exception 'FAIL 0: a signed-in request reaches the background picture look';
  end if;
  if has_table_privilege('anon', 'affiliate_products', 'select') then raise exception 'FAIL 0: anon reads products'; end if;
  if not exists (select 1 from pg_policies where tablename = 'affiliate_products' and policyname = 'two-step sign-in' and permissive = 'RESTRICTIVE') then
    raise exception 'FAIL 0: products lack the two-step rule';
  end if;
  if affiliates_brand_of('Gravastar K98 PRO') <> 'Gravastar' or affiliates_brand_of('Deepcool.com') <> 'Deepcool' or affiliates_brand_of('  Yunzii   M2 Mouse ') <> 'Yunzii'
     or affiliates_brand_of('Arzopa') <> 'Arzopa' or affiliates_brand_of('The Ridge Wallet') <> 'The Ridge' or affiliates_brand_of('the oodie') <> 'the oodie'
     or affiliates_brand_of('Keychron: Q1 Max') <> 'Keychron' or affiliates_brand_of('Razer - Kishi') <> 'Razer' or affiliates_brand_of('The') <> 'The'
     or affiliates_brand_of('') <> '' or affiliates_brand_of(null) <> '' or affiliates_brand_of('Promeed.CO Silk') <> 'Promeed' then
    raise exception 'FAIL 0: a name''s brand (%, %, %)', affiliates_brand_of('Gravastar K98 PRO'), affiliates_brand_of('The Ridge Wallet'), affiliates_brand_of('Keychron: Q1 Max');
  end if;
end $$;

-- 1. The rows from before (as 0136 kept them: one per product, nothing grouped yet) become companies with products.
alter table affiliates disable trigger affiliates_write;
insert into affiliates (id, team_id, name, kinds, status, product_url, code, percentage, platform_url, project_id, long_youtube_id, notes, created_at) values
  ('20000000-0000-4000-8000-0000000137a1', '10000000-0000-4000-8000-0000000137a0', 'Gravastar K98 PRO', '{affiliate}', 'active', 'https://www.gravastar.com/products/k98', 'K98CODE', '7%', 'https://gravastar.affiliatly.com', '40000000-0000-4000-8000-0000000137a1', null, 'Paid monthly', '2026-11-20'),
  ('20000000-0000-4000-8000-0000000137a2', '10000000-0000-4000-8000-0000000137a0', 'Gravastar Mercury Phantom', '{affiliate,review}', 'paused', 'https://www.gravastar.com/products/mercury', 'VIVERRO', '10%', null, null, 'Long137_aaa', 'Ships in 2 weeks', '2026-11-21'),
  ('20000000-0000-4000-8000-0000000137a3', '10000000-0000-4000-8000-0000000137a0', 'Gravastar Keycaps', '{affiliate}', 'active', 'https://www.gravastar.com/products/keycaps', 'VIVERRO', '10%', 'https://www.Gravastar.affiliatly.com/', null, null, null, '2026-11-22'),
  ('20000000-0000-4000-8000-0000000137a4', '10000000-0000-4000-8000-0000000137a0', 'Deepcool.com', '{review}', 'active', 'https://www.deepcool.com/products/lq360', null, null, null, null, null, null, '2026-11-19'),
  ('20000000-0000-4000-8000-0000000137a5', '10000000-0000-4000-8000-0000000137a0', 'Yunzii', '{affiliate}', 'active', 'https://yunzii.example.com/discount/viverro', 'viverro', '5%', null, null, null, null, '2026-11-18'),
  ('20000000-0000-4000-8000-0000000137a6', '10000000-0000-4000-8000-0000000137a0', 'Yunzii M2 Mouse', '{affiliate,paid}', 'active', 'https://yunzii.example.com/products/m2', 'viverro', ' 5 ', 'https://s2.affiliatly.com', null, null, null, '2026-11-23'),
  ('20000000-0000-4000-8000-0000000137a7', '10000000-0000-4000-8000-0000000137a0', 'Promeed.com', '{affiliate}', 'active', 'https://tidd.ly/4sQBz9e', 'viverro15', '15%', 'https://ui.awin.com', null, null, null, '2026-11-17'),
  ('20000000-0000-4000-8000-0000000137a8', '10000000-0000-4000-8000-0000000137a0', 'Promeed Silk', '{affiliate}', 'active', 'https://promeed.example.com/silk', 'PROMEED20', '20%', 'https://ui.awin.com', null, null, null, '2026-11-24'),
  ('20000000-0000-4000-8000-0000000137a9', '10000000-0000-4000-8000-0000000137a0', 'Arzopa Monitor', '{affiliate}', 'active', 'https://arzopa.example.com/a1', 'ARZ', '8%', 'https://arzopa.affiliatly.com', null, null, null, '2026-11-16'),
  ('20000000-0000-4000-8000-0000000137aa', '10000000-0000-4000-8000-0000000137a0', 'Arzopa Z1', '{affiliate}', 'active', 'https://arzopa.example.com/z1', 'ARZ', '8%', 'https://ui.awin.com/arzopa', null, null, null, '2026-11-16'),
  ('20000000-0000-4000-8000-0000000137ab', '10000000-0000-4000-8000-0000000137a0', 'The Ridge Wallet', '{paid}', 'ended', 'https://ridge.example.com/wallet', null, '$400 flat', null, null, null, null, '2026-11-15'),
  ('20000000-0000-4000-8000-0000000137ac', '10000000-0000-4000-8000-0000000137a0', 'The Oodie', '{review}', 'active', 'https://oodie.example.com', null, null, null, null, null, null, '2026-11-15'),
  ('20000000-0000-4000-8000-0000000137b1', '10000000-0000-4000-8000-0000000137b0', 'Gravastar Theirs', '{affiliate}', 'active', 'https://www.gravastar.com/theirs', 'THEIRS', '1%', null, null, null, null, '2026-11-20');
update affiliates set grouped_at = null where id::text like '20000000-0000-4000-8000-0000000137%';
alter table affiliates enable trigger affiliates_write;
insert into affiliate_logins (affiliate_id, team_id, sealed) values
  ('20000000-0000-4000-8000-0000000137a6', '10000000-0000-4000-8000-0000000137a0', pg_temp.sealed(1)),
  ('20000000-0000-4000-8000-0000000137a7', '10000000-0000-4000-8000-0000000137a0', pg_temp.sealed(2)),
  ('20000000-0000-4000-8000-0000000137a8', '10000000-0000-4000-8000-0000000137a0', pg_temp.sealed(3));
do $$ begin
  if affiliates_group_into_companies() <> 2 then raise exception 'FAIL 1: not two brands put together (Gravastar, Yunzii)'; end if;
end $$;
do $$ declare c record; begin
  -- Gravastar: one company (the oldest row), three products; the code most of them had; one platform (written two ways).
  select * into c from affiliates where id = '20000000-0000-4000-8000-0000000137a1';
  if c.name <> 'Gravastar' or c.code <> 'VIVERRO' or c.percentage <> '10%' or c.platform_url <> 'https://gravastar.affiliatly.com' or c.notes is not null then
    raise exception 'FAIL 1: the Gravastar company (%, %, %, %)', c.name, c.code, c.platform_url, c.notes;
  end if;
  if exists (select 1 from affiliates where id in ('20000000-0000-4000-8000-0000000137a2', '20000000-0000-4000-8000-0000000137a3')) then raise exception 'FAIL 1: the other Gravastar rows stayed'; end if;
  if (select count(*) from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137a1') <> 3 then raise exception 'FAIL 1: Gravastar doesn''t have its three products'; end if;
  if not exists (select 1 from affiliate_products where name = 'Gravastar Mercury Phantom' and affiliate_id = '20000000-0000-4000-8000-0000000137a1'
                 and status = 'paused' and kinds = '{affiliate,review}' and long_youtube_id = 'Long137_aaa' and notes = 'Ships in 2 weeks' and not own_code and code is null) then
    raise exception 'FAIL 1: a product lost its own status, type, video or notes, or didn''t take the company''s code';
  end if;
  if not exists (select 1 from affiliate_products where name = 'Gravastar K98 PRO' and own_code and code = 'K98CODE' and percentage = '7%' and notes = 'Paid monthly'
                 and project_id = '40000000-0000-4000-8000-0000000137a1' and product_url = 'https://www.gravastar.com/products/k98' and created_at = '2026-11-20') then
    raise exception 'FAIL 1: the kept row''s product lost its own code, notes, link, video or when it was made';
  end if;
  if not exists (select 1 from affiliate_products where name = 'Gravastar Keycaps' and not own_code) then raise exception 'FAIL 1: Keycaps doesn''t use the company''s code'; end if;
  -- Yunzii: kept under the row with the login (so it still opens), named by the brand.
  if not exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000137a6' and name = 'Yunzii' and platform_url = 'https://s2.affiliatly.com' and code = 'viverro' and percentage = '5%')
     or exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000137a5')
     or (select count(*) from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137a6' and not own_code) <> 2
     or not exists (select 1 from affiliate_logins where affiliate_id = '20000000-0000-4000-8000-0000000137a6') then
    raise exception 'FAIL 1: Yunzii isn''t one company under the row with the login';
  end if;
  -- Promeed: two logins; Arzopa: two platforms. Each stays two companies, with its names.
  if (select array_agg(name order by name) from affiliates where team_id = '10000000-0000-4000-8000-0000000137a0' and name ilike 'promeed%') <> '{Promeed Silk,Promeed.com}'
     or (select array_agg(name order by name) from affiliates where team_id = '10000000-0000-4000-8000-0000000137a0' and name ilike 'arzopa%') <> '{Arzopa Monitor,Arzopa Z1}' then
    raise exception 'FAIL 1: two rows with logins or platforms of their own were put together, or renamed alike';
  end if;
  if not exists (select 1 from affiliates a join affiliate_products p on p.affiliate_id = a.id where a.name = 'Deepcool' and p.name = 'Deepcool.com' and p.kinds = '{review}' and not p.own_code) then
    raise exception 'FAIL 1: Deepcool';
  end if;
  -- "The": two brands, not one.
  if not exists (select 1 from affiliates where name = 'The Ridge') or not exists (select 1 from affiliates where name = 'The Oodie')
     or not exists (select 1 from affiliate_products where name = 'The Ridge Wallet' and status = 'ended' and kinds = '{paid}' and not own_code) then
    raise exception 'FAIL 1: The Ridge and The Oodie';
  end if;
  if exists (select 1 from affiliates where team_id = '10000000-0000-4000-8000-0000000137a0' and name = 'The Ridge' and percentage is distinct from '$400 flat') then raise exception 'FAIL 1: a deal without a code'; end if;
  -- Another team's own: its company, never with this team's Gravastar.
  if not exists (select 1 from affiliates where id = '20000000-0000-4000-8000-0000000137b1' and name = 'Gravastar') or (select count(*) from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137b1') <> 1 then
    raise exception 'FAIL 1: another team''s row was mixed in';
  end if;
  if exists (select 1 from affiliates where grouped_at is null) then raise exception 'FAIL 1: some rows weren''t grouped'; end if;
  if (select count(*) from affiliate_products where team_id = '10000000-0000-4000-8000-0000000137a0') <> 12 then raise exception 'FAIL 1: a product was lost or made twice'; end if;
  if affiliates_group_into_companies() <> 0 or (select count(*) from affiliate_products where team_id = '10000000-0000-4000-8000-0000000137a0') <> 12 then raise exception 'FAIL 1: grouping again changed something'; end if;
  if exists (select 1 from affiliate_login_events where team_id = '10000000-0000-4000-8000-0000000137a0' and action <> 'granted') then raise exception 'FAIL 1: putting rows together wrote login activity'; end if;
end $$;

-- 1b. A deal that's just a number is a percentage.
do $$ begin
  if affiliates_pct('10') <> '10%' or affiliates_pct(' 12,5 % ') <> '12,5%' or affiliates_pct('7.5%') <> '7.5%' or affiliates_pct(' $5 USD OFF ') <> '$5 USD OFF'
     or affiliates_pct('10 off') <> '10 off' or affiliates_pct('') is not null or affiliates_pct(null) is not null then
    raise exception 'FAIL 1b: a deal as a percentage (%, %)', affiliates_pct('10'), affiliates_pct(' 12,5 % ');
  end if;
end $$;

-- 2. Products as people: a Master adds one (its team is its company's), an editor and another team can't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a1');
  set local role authenticated;
  insert into affiliates (id, team_id, name, code, percentage) values ('20000000-0000-4000-8000-0000000137c1', '10000000-0000-4000-8000-0000000137a0', 'Keychron', 'KEY10', '10');
  insert into affiliate_products (id, team_id, affiliate_id, name, kinds, product_url, own_code, code, created_by)
  values ('60000000-0000-4000-8000-0000000137a1', '10000000-0000-4000-8000-0000000137b0', '20000000-0000-4000-8000-0000000137c1', ' Q1 Max ', '{paid,affiliate,paid}', ' https://keychron.example.com/q1 ', false, 'IGNORED', '00000000-0000-4000-8000-0000000137a3');
commit;
do $$ declare p record; begin
  select * into p from affiliate_products where id = '60000000-0000-4000-8000-0000000137a1';
  if p.team_id <> '10000000-0000-4000-8000-0000000137a0' or p.name <> 'Q1 Max' or p.kinds <> '{affiliate,paid}' or p.product_url <> 'https://keychron.example.com/q1' or p.code is not null
     or p.created_by <> '00000000-0000-4000-8000-0000000137a1' or p.status <> 'active' then
    raise exception 'FAIL 2: a new product isn''t tidied (%, %, %, %)', p.team_id, p.name, p.kinds, p.code;
  end if;
  if (select grouped_at from affiliates where id = '20000000-0000-4000-8000-0000000137c1') is null then raise exception 'FAIL 2: a new company could be regrouped'; end if;
  if (select percentage from affiliates where id = '20000000-0000-4000-8000-0000000137c1') <> '10%' then raise exception 'FAIL 2: a company''s deal typed as a number isn''t a percentage'; end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a3');
  set local role authenticated;
  do $$ declare n int; begin
    if (select count(*) from affiliate_products) <> 13 then raise exception 'FAIL 2: an editor doesn''t read the team''s products (and only them)'; end if;
    begin
      insert into affiliate_products (team_id, affiliate_id, name) values ('10000000-0000-4000-8000-0000000137a0', '20000000-0000-4000-8000-0000000137c1', 'Mine');
      raise exception 'FAIL 2: an editor added a product';
    exception when insufficient_privilege then null;
    end;
    update affiliate_products set name = 'Hacked' where id = '60000000-0000-4000-8000-0000000137a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: an editor changed a product'; end if;
    delete from affiliate_products where id = '60000000-0000-4000-8000-0000000137a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 2: an editor deleted a product'; end if;
  end $$;
rollback;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137b1');
  set local role authenticated;
  do $$ begin
    if exists (select 1 from affiliate_products where team_id = '10000000-0000-4000-8000-0000000137a0') then raise exception 'FAIL 2: another team reads them'; end if;
    begin
      insert into affiliate_products (team_id, affiliate_id, name) values ('10000000-0000-4000-8000-0000000137b0', '20000000-0000-4000-8000-0000000137c1', 'Into theirs');
      raise exception 'FAIL 2: another team added a product to this team''s company';
    exception when insufficient_privilege then null;
    end;
  end $$;
rollback;

-- 3. Moving, its own code, its videos (G, let in).
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a2');
  set local role authenticated;
  update affiliate_products set affiliate_id = '20000000-0000-4000-8000-0000000137a1', own_code = true, code = 'Q1SPECIAL', percentage = ' 12 ' where id = '60000000-0000-4000-8000-0000000137a1';
  do $$ begin
    if not exists (select 1 from affiliate_products where id = '60000000-0000-4000-8000-0000000137a1' and affiliate_id = '20000000-0000-4000-8000-0000000137a1' and code = 'Q1SPECIAL' and percentage = '12%') then
      raise exception 'FAIL 3: moved to another company of the team, with its own code';
    end if;
    begin
      update affiliate_products set affiliate_id = '20000000-0000-4000-8000-0000000137b1' where id = '60000000-0000-4000-8000-0000000137a1';
      raise exception 'FAIL 3: moved to another team''s company';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliate_products set long_youtube_id = 'Their137_dd' where id = '60000000-0000-4000-8000-0000000137a1';
      raise exception 'FAIL 3: another team''s channel video was linked';
    exception when insufficient_privilege then null;
    end;
    begin
      update affiliate_products set project_id = '40000000-0000-4000-8000-0000000137b1' where id = '60000000-0000-4000-8000-0000000137a1';
      raise exception 'FAIL 3: another team''s long video was linked';
    exception when insufficient_privilege then null;
    end;
  end $$;
  update affiliate_products set own_code = false where id = '60000000-0000-4000-8000-0000000137a1';
  do $$ begin
    if exists (select 1 from affiliate_products where id = '60000000-0000-4000-8000-0000000137a1' and (code is not null or percentage is not null)) then
      raise exception 'FAIL 3: back to the company''s code, but its own stayed';
    end if;
  end $$;
commit;

-- 4. Verified or not.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a1');
  set local role authenticated;
  update affiliate_products set checked_result = 'works', checked_by = '00000000-0000-4000-8000-0000000137a3', checked_at = '2020-01-01'
  where affiliate_id = '20000000-0000-4000-8000-0000000137a1';
commit;
do $$ begin
  if (select count(*) from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137a1') <> 4
     or exists (select 1 from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137a1'
                and (checked_result <> 'works' or checked_by <> '00000000-0000-4000-8000-0000000137a1' or checked_at < now() - interval '1 minute')) then
    raise exception 'FAIL 4: verified, but who and when came from the app';
  end if;
end $$;
alter table affiliate_products disable trigger affiliate_products_write;
update affiliate_products set checked_at = now() - interval '3 days' where name = 'Gravastar K98 PRO';
alter table affiliate_products enable trigger affiliate_products_write;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a2');
  set local role authenticated;
  update affiliate_products set checked_result = 'works', checked_at = '2001-01-01' where name = 'Gravastar K98 PRO';
  update affiliate_products set notes = 'Checked at checkout', status = 'paused', kinds = '{review}' where name = 'Gravastar Mercury Phantom';
  update affiliate_products set product_url = 'https://www.gravastar.com/products/keycaps-v2' where name = 'Gravastar Keycaps';
commit;
do $$ begin
  if not exists (select 1 from affiliate_products where name = 'Gravastar K98 PRO' and checked_by = '00000000-0000-4000-8000-0000000137a2' and checked_at > now() - interval '1 minute') then
    raise exception 'FAIL 4: checked again, but the date and the person didn''t move';
  end if;
  if not exists (select 1 from affiliate_products where name = 'Gravastar Mercury Phantom' and checked_result = 'works' and checked_by = '00000000-0000-4000-8000-0000000137a1') then
    raise exception 'FAIL 4: notes, status or type took the mark away (or who changed)';
  end if;
  if exists (select 1 from affiliate_products where name = 'Gravastar Keycaps' and checked_result is not null) then raise exception 'FAIL 4: another product link kept the mark'; end if;
end $$;
-- The company's code changes: the products using it aren't verified any more; one with its own code (K98) still is.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a1');
  set local role authenticated;
  update affiliate_products set checked_result = 'works', checked_at = now() where name = 'Gravastar Keycaps';
  update affiliates set percentage = '12%' where id = '20000000-0000-4000-8000-0000000137a1';
  do $$ begin
    if not exists (select 1 from affiliate_products where name = 'Gravastar Keycaps' and checked_result = 'works') then raise exception 'FAIL 4: another percentage took the mark away'; end if;
  end $$;
  update affiliates set code = 'VIVERRO2' where id = '20000000-0000-4000-8000-0000000137a1';
commit;
do $$ begin
  if exists (select 1 from affiliate_products where affiliate_id = '20000000-0000-4000-8000-0000000137a1' and not own_code and checked_result is not null) then
    raise exception 'FAIL 4: the company''s code changed, but its products stayed verified';
  end if;
  if not exists (select 1 from affiliate_products where name = 'Gravastar K98 PRO' and checked_result = 'works') then raise exception 'FAIL 4: a product with its own code lost its mark'; end if;
  begin
    update affiliate_products set checked_result = 'maybe' where name = 'Gravastar K98 PRO';
    raise exception 'FAIL 4: an unknown mark was kept';
  exception when check_violation then null;
  end;
end $$;
-- Its own code, the same as the company's: still the code it goes by, the mark stays. Another one: it goes. Moved to a
-- company with another code: it goes.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a2');
  set local role authenticated;
  update affiliate_products set checked_result = 'works', checked_at = now() where name in ('Gravastar Mercury Phantom', 'Q1 Max');
  update affiliate_products set own_code = true, code = 'VIVERRO2' where name = 'Gravastar Mercury Phantom';
  do $$ begin
    if not exists (select 1 from affiliate_products where name = 'Gravastar Mercury Phantom' and own_code and checked_result = 'works') then raise exception 'FAIL 4: the same code, its own now, took the mark away'; end if;
  end $$;
  update affiliate_products set code = 'MERC5' where name = 'Gravastar Mercury Phantom';
  update affiliate_products set affiliate_id = '20000000-0000-4000-8000-0000000137c1' where name = 'Q1 Max';
commit;
do $$ begin
  if exists (select 1 from affiliate_products where name in ('Gravastar Mercury Phantom', 'Q1 Max') and checked_result is not null) then
    raise exception 'FAIL 4: another code to go by kept the mark';
  end if;
end $$;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a3');
  set local role authenticated;
  do $$ declare n int; begin
    update affiliate_products set checked_result = 'broken' where name = 'Gravastar K98 PRO';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL 4: an editor marked one'; end if;
  end $$;
rollback;

-- 5. The picture look, on products.
update affiliate_products set image_checked_at = null, image_url = null, image_source = null where team_id = '10000000-0000-4000-8000-0000000137a0';
update affiliate_products set image_source = 'none' where name = 'Deepcool.com';
begin;
  set local role service_role;
  do $$ declare ids uuid[]; again int; want int; begin
    select count(*) into want from affiliate_products
    where team_id = '10000000-0000-4000-8000-0000000137a0' and product_url is not null and image_source is null;
    select array_agg(c.id) into ids from affiliate_product_pictures_claim('10000000-0000-4000-8000-0000000137a0', null, 50) c;
    if want < 10 or cardinality(ids) <> want or exists (select 1 from affiliate_products p where p.id = any (ids) and (p.name = 'Deepcool.com' or p.team_id <> '10000000-0000-4000-8000-0000000137a0')) then
      raise exception 'FAIL 5: the look took the wrong ones (%)', cardinality(ids);
    end if;
    select count(*) into again from affiliate_product_pictures_claim('10000000-0000-4000-8000-0000000137a0', null, 50);
    if again <> 0 then raise exception 'FAIL 5: the same ones were taken twice'; end if;
    if not affiliate_product_picture_found((select id from affiliate_products where name = 'Gravastar K98 PRO'), 'https://www.gravastar.com/products/k98', 'https://www.gravastar.com/img/k98.png') then
      raise exception 'FAIL 5: a found picture wasn''t kept';
    end if;
    if affiliate_product_picture_found((select id from affiliate_products where name = 'Q1 Max'), 'https://keychron.example.com/OTHER', 'https://x.example.com/q.png') then
      raise exception 'FAIL 5: a picture for a link that changed meanwhile was kept';
    end if;
  end $$;
commit;
do $$ begin
  if not exists (select 1 from affiliate_products where name = 'Gravastar K98 PRO' and image_url = 'https://www.gravastar.com/img/k98.png' and image_source = 'page' and checked_result = 'works') then
    raise exception 'FAIL 5: the found picture isn''t there (or the look touched the mark)';
  end if;
end $$;

-- 6. Deleting a company takes its products; deleting the team, everything.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000137a1');
  set local role authenticated;
  delete from affiliates where name = 'Deepcool' and team_id = '10000000-0000-4000-8000-0000000137a0';
commit;
do $$ begin
  if exists (select 1 from affiliate_products where name = 'Deepcool.com') then raise exception 'FAIL 6: a deleted company''s products stayed'; end if;
end $$;
delete from teams where id in ('10000000-0000-4000-8000-0000000137a0', '10000000-0000-4000-8000-0000000137b0');
do $$ begin
  if exists (select 1 from affiliate_products where team_id in ('10000000-0000-4000-8000-0000000137a0', '10000000-0000-4000-8000-0000000137b0')) then raise exception 'FAIL 6: a deleted team''s products stayed'; end if;
end $$;
delete from profiles where email like '%137@example.com';
delete from auth.users where email like '%137@example.com';
