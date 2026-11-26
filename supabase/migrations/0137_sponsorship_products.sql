-- ============================================================================
-- 0137: Sponsorships as companies with products (1.58.0).
--
-- The owner (Nov 26 2026): "i want a group of products as the company and then i want to be able to add products, so
-- the information like the affiliate platform will always be the same so it doesnt become redunant … we should have
-- groups in the table, dropdowns". The code: "if i add a code for the comapny itself, i should be able to click a
-- button and use the regular company one or have the option to add a custom one for each too". Type and status: on
-- each product. And: "i want one more thing saying verified or not, because i will check to see if they dont work or
-- not". The ones already there: grouped by brand.
--
--   * affiliates is now the company: its name, the code and the deal for its products, the affiliate platform, notes,
--     and its login (affiliate_logins, unchanged: sealed for its team and this row). Its product columns stay as they
--     were (nothing reads them any more).
--   * affiliate_products: each product of a company: name, kinds (affiliate|review|paid), status, product link and
--     picture (0136's rules), its own code and deal (own_code; else the company's), the long video and the Short
--     (the team's own or only on the channel, 0136's rules), verified or not (checked_result works|broken, who and
--     when the database's; another link or code clears it, the company's code too for the ones using it), notes.
--     Everyone on the team reads them; the people who change sponsorships change them. A product stays in its team;
--     moved to another company only of the same team.
--   * affiliate_product_pictures_claim(), affiliate_product_picture_found(): the background picture look, on products.
--   * affiliates_group_into_companies(): the rows from before become companies with their products: each row's product
--     (its notes too) moves to affiliate_products; rows whose names start with the same word (".com" and the like left
--     out; two words after "The" and the like) on a team come together under one (the one with a login, else the
--     oldest), never two with logins or two affiliate platforms; the company takes the code and deal most of them had
--     and is named by that word (unless another company of the team goes by it too); a product whose code or deal
--     wasn't the company's keeps its own. Once (affiliates.grouped_at).
--   * affiliates_pct(): a deal that's just a number is a percentage ("10" → "10%"; the owner: "i shouldnt need to write
--     % on my own"), for the companies and the products, the ones from before too.
--
-- supabase/tests/sponsorship-products.test.sql checks it. Additive; safe to run twice.
-- ============================================================================

alter table public.affiliates add column if not exists grouped_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. The products
-- ---------------------------------------------------------------------------
-- A deal that's just a number is a percentage: "10" → "10%", " 12,5 % " → "12,5%"; anything else as written ("$5 off").
create or replace function public.affiliates_pct(p_deal text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_deal ~ '^\s*[0-9]+([.,][0-9]+)?\s*%?\s*$' then regexp_replace(p_deal, '^\s*([0-9]+([.,][0-9]+)?)\s*%?\s*$', '\1%')
    else nullif(btrim(coalesce(p_deal, '')), '')
  end;
$$;
revoke all on function public.affiliates_pct(text) from public, anon;
grant execute on function public.affiliates_pct(text) to authenticated, service_role;

create table if not exists public.affiliate_products (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  name text not null,
  kinds text[] not null default array['affiliate']::text[],
  status text not null default 'active',
  product_url text,
  own_code boolean not null default false,
  code text,
  percentage text,
  project_id uuid references public.long_video_projects(id) on delete set null,
  long_youtube_id text,
  short_id uuid references public.short_videos(id) on delete set null,
  short_youtube_id text,
  image_url text,
  image_source text,
  image_checked_at timestamptz,
  checked_result text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint affiliate_products_name_ok check (char_length(btrim(name)) between 1 and 120),
  constraint affiliate_products_kinds_ok check (cardinality(kinds) between 1 and 3 and kinds <@ array['affiliate', 'review', 'paid']::text[]),
  constraint affiliate_products_status_ok check (status in ('active', 'paused', 'ended')),
  constraint affiliate_products_url_ok check (product_url is null or (char_length(product_url) <= 2000 and product_url ~* '^https?://[^[:space:]]+$')),
  constraint affiliate_products_code_ok check ((code is null or char_length(code) between 1 and 100) and (percentage is null or char_length(percentage) between 1 and 60)),
  constraint affiliate_products_own_code_ok check (own_code or (code is null and percentage is null)),
  constraint affiliate_products_youtube_ok check (
    (long_youtube_id is null or long_youtube_id ~ '^[A-Za-z0-9_-]{11}$')
    and (short_youtube_id is null or short_youtube_id ~ '^[A-Za-z0-9_-]{11}$')
    and (project_id is null or long_youtube_id is null)
    and (short_id is null or short_youtube_id is null)
  ),
  constraint affiliate_products_image_ok check (
    (image_url is null or (char_length(image_url) <= 2000 and image_url ~* '^https://[^[:space:]]+$'))
    and (image_source is null or image_source in ('page', 'link', 'none'))
    and ((image_url is null) = (image_source is null or image_source = 'none'))
  ),
  constraint affiliate_products_checked_ok check (
    (checked_result is null or checked_result in ('works', 'broken'))
    and ((checked_result is null) = (checked_at is null))
  ),
  constraint affiliate_products_notes_ok check (notes is null or char_length(notes) <= 2000)
);
create index if not exists affiliate_products_company_idx on public.affiliate_products (affiliate_id, created_at);
create index if not exists affiliate_products_team_idx on public.affiliate_products (team_id, created_at desc);
create index if not exists affiliate_products_project_idx on public.affiliate_products (project_id) where project_id is not null;
create index if not exists affiliate_products_short_idx on public.affiliate_products (short_id) where short_id is not null;
create index if not exists affiliate_products_checked_by_idx on public.affiliate_products (checked_by) where checked_by is not null;
create index if not exists affiliate_products_created_by_idx on public.affiliate_products (created_by);
create index if not exists affiliate_products_updated_by_idx on public.affiliate_products (updated_by);

create or replace function public.affiliate_products_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  picture constant text[] := array['image_url', 'image_source', 'image_checked_at'];
  company_team uuid;
  new_long boolean := tg_op = 'INSERT';
  new_short boolean := tg_op = 'INSERT';
  new_code boolean := false;
begin
  -- A linked video deleted, or the company's code changed (0137, below): nobody "edited" the product.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  -- Only the picture changed (the server's look in the background, or someone's choice): not an edit either.
  if tg_op = 'UPDATE' and (to_jsonb(new) - picture) = (to_jsonb(old) - picture) then
    return new;
  end if;
  new.name := btrim(new.name);
  new.product_url := nullif(btrim(coalesce(new.product_url, '')), '');
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.percentage := public.affiliates_pct(new.percentage);
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if not new.own_code then
    new.code := null;
    new.percentage := null;
  end if;
  if new.kinds is null or cardinality(new.kinds) = 0 or not (new.kinds <@ array['affiliate', 'review', 'paid']::text[]) then
    raise exception 'Pick what kind of deal it is: affiliate, review or paid.' using errcode = 'check_violation';
  end if;
  new.kinds := array(
    select k from unnest(array['affiliate', 'review', 'paid']::text[]) with ordinality as t(k, i) where k = any (new.kinds) order by i
  );
  -- Its company: on this team (a product is always its company's team's).
  select a.team_id into company_team from affiliates a where a.id = new.affiliate_id;
  if company_team is null then
    raise exception 'That company isn''t here any more.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.team_id := company_team;
    if (select count(*) from affiliate_products where affiliate_id = new.affiliate_id) >= 200 then
      raise exception 'A company can keep 200 products.' using errcode = 'check_violation';
    end if;
    if (select count(*) from affiliate_products where team_id = new.team_id) >= 2000 then
      raise exception 'A team can keep 2,000 products.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id or company_team is distinct from old.team_id then
      raise exception 'A product stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new_long := new.long_youtube_id is distinct from old.long_youtube_id;
    new_short := new.short_youtube_id is distinct from old.short_youtube_id;
    -- The code it goes by: its own, or its company's.
    new_code := new.product_url is distinct from old.product_url
      or (case when new.own_code then new.code else (select a.code from affiliates a where a.id = new.affiliate_id) end)
         is distinct from (case when old.own_code then old.code else (select a.code from affiliates a where a.id = old.affiliate_id) end);
    -- Another product link: its picture may be looked for again.
    if new.product_url is distinct from old.product_url then
      new.image_checked_at := null;
    end if;
  end if;
  -- A linked video is one of the team's own; one only on the channel, one the team's channel lists (when it's set).
  if new.project_id is not null and not exists (select 1 from long_video_projects p where p.id = new.project_id and p.team_id = new.team_id) then
    raise exception 'That long video isn''t on this team.' using errcode = '42501';
  end if;
  if new.short_id is not null and not exists (select 1 from short_videos s where s.id = new.short_id and s.team_id = new.team_id) then
    raise exception 'That short isn''t on this team.' using errcode = '42501';
  end if;
  if new_long and new.long_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.long_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  if new_short and new.short_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.short_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  -- Verified or not: who and when are the database's. Set, changed, or checked again (the app sends a new time: only
  -- that it changed counts). Another link, or another code to go by, hasn't been checked: the mark goes, unless this
  -- same change sets one.
  if tg_op = 'INSERT' then
    new.checked_by := case when new.checked_result is null then null else auth.uid() end;
    new.checked_at := case when new.checked_result is null then null else now() end;
  elsif new.checked_result is distinct from old.checked_result or (new.checked_result is not null and new.checked_at is distinct from old.checked_at) then
    new.checked_by := case when new.checked_result is null then null else auth.uid() end;
    new.checked_at := case when new.checked_result is null then null else now() end;
  elsif new_code then
    new.checked_result := null;
    new.checked_by := null;
    new.checked_at := null;
  else
    new.checked_by := old.checked_by;
    new.checked_at := old.checked_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.affiliate_products_write() from public, anon, authenticated;

alter table public.affiliate_products enable row level security;
revoke all on public.affiliate_products from anon, authenticated;
grant select, insert, update, delete on public.affiliate_products to authenticated;
drop policy if exists "the team reads its products" on public.affiliate_products;
create policy "the team reads its products" on public.affiliate_products for select to authenticated
  using (team_id in (select public.my_team_ids()));
drop policy if exists "affiliate people add products" on public.affiliate_products;
create policy "affiliate people add products" on public.affiliate_products for insert to authenticated
  with check (team_id in (select public.affiliate_team_ids()));
drop policy if exists "affiliate people change products" on public.affiliate_products;
create policy "affiliate people change products" on public.affiliate_products for update to authenticated
  using (team_id in (select public.affiliate_team_ids()))
  with check (team_id in (select public.affiliate_team_ids()));
drop policy if exists "affiliate people delete products" on public.affiliate_products;
create policy "affiliate people delete products" on public.affiliate_products for delete to authenticated
  using (team_id in (select public.affiliate_team_ids()));
drop policy if exists "two-step sign-in" on public.affiliate_products;
create policy "two-step sign-in" on public.affiliate_products as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

do $$
begin
  begin
    alter publication supabase_realtime add table public.affiliate_products;
  exception when others then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The company: new ones are never regrouped; another code un-verifies the products that use it
-- ---------------------------------------------------------------------------
create or replace function public.affiliates_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  picture constant text[] := array['image_url', 'image_source', 'image_checked_at'];
  new_long boolean := tg_op = 'INSERT';
  new_short boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - picture) = (to_jsonb(old) - picture) then
    return new;
  end if;
  new.name := btrim(new.name);
  new.product_url := nullif(btrim(coalesce(new.product_url, '')), '');
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.percentage := public.affiliates_pct(new.percentage);
  new.platform_url := nullif(btrim(coalesce(new.platform_url, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if new.kinds is null or cardinality(new.kinds) = 0 or not (new.kinds <@ array['affiliate', 'review', 'paid']::text[]) then
    raise exception 'Pick what kind of deal it is: affiliate, review or paid.' using errcode = 'check_violation';
  end if;
  new.kinds := array(
    select k from unnest(array['affiliate', 'review', 'paid']::text[]) with ordinality as t(k, i) where k = any (new.kinds) order by i
  );
  if tg_op = 'INSERT' then
    if (select count(*) from affiliates where team_id = new.team_id) >= 1000 then
      raise exception 'A team can keep 1,000 companies.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    -- (A company made now is one already: affiliates_group_into_companies() leaves it alone.)
    new.grouped_at := now();
  else
    if new.team_id is distinct from old.team_id then
      raise exception 'A company stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.grouped_at := old.grouped_at;
    new_long := new.long_youtube_id is distinct from old.long_youtube_id;
    new_short := new.short_youtube_id is distinct from old.short_youtube_id;
    if new.product_url is distinct from old.product_url then
      new.image_checked_at := null;
    end if;
  end if;
  if new.project_id is not null and not exists (select 1 from long_video_projects p where p.id = new.project_id and p.team_id = new.team_id) then
    raise exception 'That long video isn''t on this team.' using errcode = '42501';
  end if;
  if new.short_id is not null and not exists (select 1 from short_videos s where s.id = new.short_id and s.team_id = new.team_id) then
    raise exception 'That short isn''t on this team.' using errcode = '42501';
  end if;
  if new_long and new.long_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.long_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  if new_short and new.short_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.short_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.affiliates_write() from public, anon, authenticated;
drop trigger if exists affiliates_write on public.affiliates;
create trigger affiliates_write before insert or update on public.affiliates
  for each row execute function public.affiliates_write();

create or replace function public.affiliates_code_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.code is distinct from old.code then
    update affiliate_products set checked_result = null, checked_by = null, checked_at = null
    where affiliate_id = new.id and not own_code and checked_result is not null;
  end if;
  return null;
end;
$$;
revoke all on function public.affiliates_code_changed() from public, anon, authenticated;
drop trigger if exists affiliates_code_changed on public.affiliates;
create trigger affiliates_code_changed after update of code on public.affiliates
  for each row execute function public.affiliates_code_changed();

-- ---------------------------------------------------------------------------
-- 3. The background picture look, on products (the server, with its own key)
-- ---------------------------------------------------------------------------
create or replace function public.affiliate_product_pictures_claim(p_team uuid, p_ids uuid[] default null, p_max int default 6)
returns table (id uuid, product_url text)
language sql
security definer set search_path = public
as $$
  with picked as (
    select p.id
    from affiliate_products p
    where p.team_id = p_team
      and p.product_url is not null
      and p.image_url is null
      and p.image_source is null
      and (p.image_checked_at is null or p.image_checked_at < now() - interval '7 days')
      and (p_ids is null or p.id = any (p_ids))
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_max, 6), 50))
    for update of p skip locked
  )
  update affiliate_products p set image_checked_at = now()
  from picked
  where p.id = picked.id
  returning p.id, p.product_url;
$$;
revoke all on function public.affiliate_product_pictures_claim(uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.affiliate_product_pictures_claim(uuid, uuid[], int) to service_role;

create or replace function public.affiliate_product_picture_found(p_product uuid, p_product_url text, p_image text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  update affiliate_products set image_url = p_image, image_source = 'page'
  where id = p_product and product_url = p_product_url and image_url is null and image_source is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.affiliate_product_picture_found(uuid, text, text) from public, anon, authenticated;
grant execute on function public.affiliate_product_picture_found(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The rows from before: companies with their products
-- ---------------------------------------------------------------------------
-- A name's brand: its first word ("Gravastar K98 PRO" → "Gravastar"), two after "The", "A", "My" and the like ("The Ridge
-- Wallet" → "The Ridge"), without a ".com" and the like ("Deepcool.com" → "Deepcool") or a "," ":" "-" after it.
create or replace function public.affiliates_brand_of(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  with w as (
    select string_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ') as words
  )
  select regexp_replace(
    regexp_replace(
      case
        when cardinality(words) > 1 and lower(words[1]) in ('the', 'a', 'an', 'my', 'mr', 'mrs', 'ms', 'dr', 'la', 'le', 'el', 'les', 'los', 'las', 'die', 'der', 'das')
          then words[1] || ' ' || words[2]
        else coalesce(words[1], '')
      end,
      '[,:;|–—-]+$', ''
    ),
    '\.(com|net|org|io|co|shop|store|ro|eu|de|uk|us|ca|au|fr|it|es|nl|pl|tech|gg|tv|me|app)$',
    '',
    'i'
  )
  from w;
$$;
revoke all on function public.affiliates_brand_of(text) from public, anon;
grant execute on function public.affiliates_brand_of(text) to authenticated, service_role;

create or replace function public.affiliates_group_into_companies()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  g record;
  keep uuid;
  others uuid[];
  pick_code text;
  pick_pct text;
  merged int := 0;
begin
  if not exists (select 1 from affiliates where grouped_at is null) then
    return 0;
  end if;
  -- Moving rows around isn't anyone's edit: who and when stay as they were.
  alter table public.affiliates disable trigger affiliates_write;
  alter table public.affiliates disable trigger affiliates_code_changed;
  alter table public.affiliate_products disable trigger affiliate_products_write;

  -- (0) A deal kept as a bare number is the percentage it is ("10" and "10%" the same deal, below too).
  update affiliates set percentage = affiliates_pct(percentage) where grouped_at is null and percentage is distinct from affiliates_pct(percentage);

  -- (1) Each row's product, with everything about the product (its notes too; its code and deal too, for now).
  insert into affiliate_products (team_id, affiliate_id, name, kinds, status, product_url, own_code, code, percentage, project_id,
                                  long_youtube_id, short_id, short_youtube_id, image_url, image_source, image_checked_at, notes,
                                  created_by, created_at, updated_by, updated_at)
  select a.team_id, a.id, a.name, a.kinds, a.status, a.product_url, true, a.code, a.percentage, a.project_id,
         a.long_youtube_id, a.short_id, a.short_youtube_id, a.image_url, a.image_source, a.image_checked_at, a.notes,
         a.created_by, a.created_at, a.updated_by, a.updated_at
  from affiliates a
  where a.grouped_at is null and not exists (select 1 from affiliate_products p where p.affiliate_id = a.id);

  -- (2) Rows of one brand on a team come together under one: the one with a login, else the oldest. Never two with
  --     logins (each is sealed for its own row) or two affiliate platforms: those stay apart.
  for g in
    with x as (
      select a.id, a.team_id, a.created_at, lower(affiliates_brand_of(a.name)) as k,
             exists (select 1 from affiliate_logins l where l.affiliate_id = a.id) as has_login,
             nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(a.platform_url, '')), '^https?://(www\.)?', '', 'i'), '/+$', '')), '') as platform
      from affiliates a
      where a.grouped_at is null
    )
    select x.team_id, x.k, array_agg(x.id order by x.has_login desc, x.created_at, x.id) as ids
    from x
    where x.k <> ''
    group by x.team_id, x.k
    having count(*) > 1 and count(*) filter (where x.has_login) <= 1 and count(distinct x.platform) <= 1
  loop
    keep := g.ids[1];
    others := g.ids[2:];
    -- The company's code and deal: the ones most of its products had (a tie: the kept row's, then the oldest).
    pick_code := null;
    pick_pct := null;
    select o.code, o.percentage into pick_code, pick_pct
    from unnest(g.ids) with ordinality as u(id, i)
    join affiliates o on o.id = u.id
    where o.code is not null or o.percentage is not null
    group by o.code, o.percentage
    order by count(*) desc, min(u.i)
    limit 1;
    update affiliates s set
      code = pick_code,
      percentage = pick_pct,
      platform_url = coalesce(s.platform_url, (select o.platform_url from affiliates o where o.id = any (others) and o.platform_url is not null order by o.created_at, o.id limit 1))
    where s.id = keep;
    update affiliate_products set affiliate_id = keep where affiliate_id = any (others);
    delete from affiliates where id = any (others);
    merged := merged + 1;
  end loop;

  -- (3) A product whose code and deal are its company's uses the company's; the others keep their own (none too).
  update affiliate_products p set own_code = false, code = null, percentage = null
  from affiliates c
  where p.affiliate_id = c.id and c.grouped_at is null
    and p.code is not distinct from c.code and p.percentage is not distinct from c.percentage;

  -- (4) The company: named by the brand ("Abxylute P5 Controller" → "Abxylute"; the product keeps the whole name), unless
  --     another company of the team goes by it too (two that stayed apart keep their names, to tell them apart). Its
  --     notes went with its product.
  update affiliates a set name = affiliates_brand_of(a.name)
  where a.grouped_at is null
    and affiliates_brand_of(a.name) <> '' and affiliates_brand_of(a.name) <> a.name
    and not exists (
      select 1 from affiliates o
      where o.team_id = a.team_id and o.id <> a.id and lower(affiliates_brand_of(o.name)) = lower(affiliates_brand_of(a.name))
    );
  update affiliates set notes = null, grouped_at = now() where grouped_at is null;

  alter table public.affiliate_products enable trigger affiliate_products_write;
  alter table public.affiliates enable trigger affiliates_code_changed;
  alter table public.affiliates enable trigger affiliates_write;
  return merged;
end;
$$;
revoke all on function public.affiliates_group_into_companies() from public, anon, authenticated, service_role;

-- The products' own rule (made after the function above: it's switched off while rows move).
drop trigger if exists affiliate_products_write on public.affiliate_products;
create trigger affiliate_products_write before insert or update on public.affiliate_products
  for each row execute function public.affiliate_products_write();

do $$
begin
  perform public.affiliates_group_into_companies();
end;
$$;

notify pgrst, 'reload schema';
