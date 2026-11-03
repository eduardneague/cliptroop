-- ============================================================================
-- 0120: Business (1.42.0): a PFA's registers, for the teams a developer turns
-- it on for.
--
-- The owner (Oct 28 2026): "vreau să integrez în aplicație aceste 3 registre,
-- vreau să fie ceva total custom și doar pentru echipe pe care eu le selectez
-- din baza de date ca developer"; one team is one PFA; the team's owner sees it
-- and chooses who else does (view, or edit too). The registers follow OMFP
-- 170/2015 (Registrul-jurnal de încasări și plăți 14-1-1/b, Registrul-inventar
-- 14-1-2/b, Fișa mijlocului fix 14-2-2) and OMFP 3254/2017 (Registrul de
-- evidență fiscală); the app lays them out from these rows (modules/business).
--
--   * team_features: which teams have Business. Nobody signed in writes it:
--     the Developer page does, with the server's key, after checking the
--     person is a developer (DEVELOPER_EMAILS). The team's members see it.
--   * business_access: who else sees the team's Business (can_edit: changes
--     it too). The team's owner gives it to someone else active on the team,
--     changes it and takes it away; leaving the team or becoming its owner
--     takes it away. The owner always sees and edits.
--   * business_profiles (the PFA: name, CUI, address, regime, opening
--     balances…), business_sources (income sources: a page each in the fiscal
--     register), business_years (a year closed: nothing in it changes until
--     it's reopened; the fiscal register's "Rectificare"), business_entries
--     (the cash book: every receipt and payment, in lei), business_assets
--     (fixed assets and how they're amortized), business_inventories and
--     business_inventory_items (the inventory at a date), business_files
--     (receipts, invoices, statements in the private business-docs bucket),
--     business_ref_lines (fiscal register lines that aren't cash: income in kind,
--     a correction),
--     business_history (every change: who, when, before and after; written by
--     the database only).
--   * Reading: the owner and the people given access, while Business is on
--     for the team (business_team_ids()); writing: the owner and those who may
--     edit (business_edit_team_ids()). Turned off, the rows stay and nobody
--     reads them until it's on again.
--
-- supabase/tests/business.test.sql checks it. Additive; safe to run twice.
-- Staging first, then production.
-- ============================================================================

-- ---- 1. Which teams have it ------------------------------------------------

create table if not exists team_features (
  team_id uuid not null references teams(id) on delete cascade,
  feature text not null check (feature in ('business')),
  enabled_by uuid references profiles(id) on delete set null,
  enabled_at timestamptz not null default now(),
  primary key (team_id, feature)
);
create index if not exists team_features_enabled_by_idx on team_features (enabled_by);
alter table team_features enable row level security;
revoke all on team_features from anon, authenticated;
grant select on team_features to authenticated;
drop policy if exists "the team sees its features" on team_features;
create policy "the team sees its features" on team_features for select to authenticated
  using (team_id in (select my_team_ids()));
-- (No rule to add, change or remove one: only the server's key, from the Developer page.)

-- ---- 2. Who else sees it ---------------------------------------------------

create table if not exists business_access (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  can_edit boolean not null default false,
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists business_access_user_idx on business_access (user_id);
create index if not exists business_access_granted_by_idx on business_access (granted_by);
alter table business_access enable row level security;
revoke all on business_access from anon, authenticated;
grant select, insert, delete on business_access to authenticated;
grant update (can_edit) on business_access to authenticated;

drop policy if exists "the owner and the person see business access" on business_access;
create policy "the owner and the person see business access" on business_access for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select my_owned_team_ids()));
drop policy if exists "the owner gives business access" on business_access;
create policy "the owner gives business access" on business_access for insert to authenticated
  with check (
    team_id in (select my_owned_team_ids())
    and user_id <> (select auth.uid())
    and exists (
      select 1 from team_members tm
       where tm.team_id = business_access.team_id and tm.user_id = business_access.user_id and tm.status = 'active'
    )
  );
drop policy if exists "the owner changes business access" on business_access;
create policy "the owner changes business access" on business_access for update to authenticated
  using (team_id in (select my_owned_team_ids()))
  with check (team_id in (select my_owned_team_ids()));
drop policy if exists "the owner takes business access away" on business_access;
create policy "the owner takes business access away" on business_access for delete to authenticated
  using (team_id in (select my_owned_team_ids()));

-- Who gave it and when: the database's, whatever the app sends.
create or replace function business_access_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.granted_at := now();
  return new;
end;
$$;
revoke all on function business_access_stamp() from public, anon, authenticated;
drop trigger if exists business_access_stamp on business_access;
create trigger business_access_stamp before insert or update on business_access
  for each row execute procedure business_access_stamp();

-- Leaving the team takes it away; becoming the owner too (the owner needs nothing given).
create or replace function business_access_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from business_access where team_id = old.team_id and user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function business_access_on_leave() from public, anon, authenticated;
drop trigger if exists business_access_on_leave on team_members;
create trigger business_access_on_leave after delete on team_members
  for each row execute function business_access_on_leave();

create or replace function business_access_new_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    delete from business_access where team_id = new.id and user_id = new.owner_id;
  end if;
  return null;
end;
$$;
revoke all on function business_access_new_owner() from public, anon, authenticated;
drop trigger if exists business_access_new_owner on teams;
create trigger business_access_new_owner after update of owner_id on teams
  for each row execute function business_access_new_owner();

-- ---- 3. Who reads and who writes (asked once per query, like 0109's helpers) ----

-- The teams with Business on where you're the owner, or were given it while active on the team.
create or replace function business_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.team_id
    from team_features f
    join teams t on t.id = f.team_id
   where f.feature = 'business'
     and (
       t.owner_id = auth.uid()
       or exists (
         select 1 from business_access a
           join team_members tm on tm.team_id = a.team_id and tm.user_id = a.user_id and tm.status = 'active'
          where a.team_id = f.team_id and a.user_id = auth.uid()
       )
     );
$$;
revoke all on function business_team_ids() from public, anon;
grant execute on function business_team_ids() to authenticated, service_role;

-- The same, for writing: the owner, and those given it with can_edit.
create or replace function business_edit_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.team_id
    from team_features f
    join teams t on t.id = f.team_id
   where f.feature = 'business'
     and (
       t.owner_id = auth.uid()
       or exists (
         select 1 from business_access a
           join team_members tm on tm.team_id = a.team_id and tm.user_id = a.user_id and tm.status = 'active'
          where a.team_id = f.team_id and a.user_id = auth.uid() and a.can_edit
       )
     );
$$;
revoke all on function business_edit_team_ids() from public, anon;
grant execute on function business_edit_team_ids() to authenticated, service_role;

-- What you have in one team: 'owner', 'edit', 'view', or nothing (Business off, or not yours). The menu asks it.
create or replace function my_business_access(p_team uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when not exists (select 1 from team_features f where f.team_id = p_team and f.feature = 'business') then null
           when exists (select 1 from teams t where t.id = p_team and t.owner_id = auth.uid()) then 'owner'
           else (
             select case when a.can_edit then 'edit' else 'view' end
               from business_access a
               join team_members tm on tm.team_id = a.team_id and tm.user_id = a.user_id and tm.status = 'active'
              where a.team_id = p_team and a.user_id = auth.uid()
           )
         end;
$$;
revoke all on function my_business_access(uuid) from public, anon;
grant execute on function my_business_access(uuid) to authenticated, service_role;

-- ---- 4. The PFA, its income sources, its years -----------------------------

create table if not exists business_profiles (
  team_id uuid primary key references teams(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 200),
  holder text not null default '' check (char_length(holder) <= 120),
  cui text not null default '' check (char_length(cui) <= 20),
  reg_no text not null default '' check (char_length(reg_no) <= 40),
  address text not null default '' check (char_length(address) <= 300),
  caen text not null default '' check (char_length(caen) <= 80),
  regime text not null default 'real' check (regime in ('real', 'norma')),
  vat text not null default 'none' check (vat in ('none', 'special', 'payer')),
  activity_start date,
  keeps_cash boolean not null default false,
  opening_date date,
  opening_cash numeric(14,2) not null default 0 check (abs(opening_cash) < 1e12),
  opening_bank numeric(14,2) not null default 0 check (abs(opening_bank) < 1e12),
  -- Which BNR rate turns a foreign amount into lei: 'previous', the one BNR gave on the last banking day before the
  -- operation (OMFP 170/2015, Cap. III pct. 18: "din ultima zi bancară anterioară operațiunii"), or 'day', the one dated
  -- the operation's own day, for an accountant who works that way.
  fx_rule text not null default 'previous' check (fx_rule in ('day', 'previous')),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists business_profiles_updated_by_idx on business_profiles (updated_by);

create table if not exists business_sources (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'independent' check (category in ('independent', 'ip', 'rent', 'other')),
  archived boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, team_id)
);
create index if not exists business_sources_team_idx on business_sources (team_id, position);

create table if not exists business_years (
  team_id uuid not null references teams(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  closed_at timestamptz,
  closed_by uuid references profiles(id) on delete set null,
  rectified boolean not null default false,
  primary key (team_id, year)
);
create index if not exists business_years_closed_by_idx on business_years (closed_by);

-- ---- 5. Fixed assets, the cash book, inventories, files --------------------

create table if not exists business_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  inventory_no text not null check (char_length(btrim(inventory_no)) between 1 and 30),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  details text not null default '' check (char_length(details) <= 1000),
  catalog_code text not null default '' check (char_length(catalog_code) <= 20),
  document text not null default '' check (char_length(document) <= 160),
  acquired_on date not null,
  in_service_on date not null,
  value numeric(14,2) not null check (value > 0 and value < 1e12),
  life_months int not null check (life_months between 1 and 1200),
  method text not null default 'linear' check (method in ('linear', 'degressive', 'accelerated')),
  car_cap boolean not null default false,
  disposed_on date,
  disposal_note text not null default '' check (char_length(disposal_note) <= 300),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (team_id, inventory_no),
  unique (id, team_id),
  check (in_service_on >= acquired_on),
  check (disposed_on is null or disposed_on >= in_service_on)
);
create index if not exists business_assets_created_by_idx on business_assets (created_by);
create index if not exists business_assets_updated_by_idx on business_assets (updated_by);

create table if not exists business_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  entry_date date not null,
  doc_type text not null default '' check (char_length(doc_type) <= 40),
  doc_number text not null default '' check (char_length(doc_number) <= 60),
  explanation text not null default '' check (char_length(explanation) <= 300),
  partner text not null default '' check (char_length(partner) <= 160),
  direction text not null check (direction in ('in', 'out')),
  channel text not null check (channel in ('cash', 'bank')),
  -- Lei, as the register keeps them; below zero only on a line that reverses another (storno).
  amount numeric(14,2) not null check (amount <> 0 and abs(amount) < 1e12),
  -- For a VAT-registered PFA: the VAT inside the amount (the cash book keeps it; the fiscal register leaves it out).
  vat_amount numeric(14,2) not null default 0,
  kind text not null,
  -- An expense's nature, or an income's type (modules/business/lib/kinds.ts).
  nature text not null default '' check (char_length(nature) <= 30),
  source_id uuid,
  deductible_pct numeric(5,2) not null default 100 check (deductible_pct between 0 and 100),
  currency text not null default 'RON' check (currency ~ '^[A-Z]{3}$'),
  fx_amount numeric(14,2) check (fx_amount is null or abs(fx_amount) < 1e12),
  fx_rate numeric(14,6) check (fx_rate is null or fx_rate > 0),
  fx_rate_date date,
  asset_id uuid,
  reversal_of uuid,
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (id, team_id),
  constraint business_entries_kind check (
    (direction = 'in' and kind in ('income', 'contribution', 'loan', 'transfer', 'other'))
    or (direction = 'out' and kind in ('expense', 'asset', 'nondeductible', 'tax', 'withdrawal', 'loan', 'transfer', 'other'))
  ),
  constraint business_entries_storno check (amount > 0 or reversal_of is not null),
  constraint business_entries_vat check (abs(vat_amount) < abs(amount) and (vat_amount = 0 or sign(vat_amount) = sign(amount))),
  -- Whatever an entry points at is the same team's.
  constraint business_entries_source foreign key (source_id, team_id) references business_sources (id, team_id),
  constraint business_entries_asset foreign key (asset_id, team_id) references business_assets (id, team_id),
  constraint business_entries_reversal foreign key (reversal_of, team_id) references business_entries (id, team_id)
);
create index if not exists business_entries_team_date_idx on business_entries (team_id, entry_date);
create index if not exists business_entries_source_idx on business_entries (source_id, team_id);
create index if not exists business_entries_asset_idx on business_entries (asset_id, team_id);
create index if not exists business_entries_reversal_idx on business_entries (reversal_of, team_id);
create index if not exists business_entries_created_by_idx on business_entries (created_by);
create index if not exists business_entries_updated_by_idx on business_entries (updated_by);

create table if not exists business_inventories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  taken_on date not null,
  kind text not null default 'year_end' check (kind in ('start', 'year_end', 'end', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (team_id, taken_on),
  unique (id, team_id)
);
create index if not exists business_inventories_created_by_idx on business_inventories (created_by);
create index if not exists business_inventories_updated_by_idx on business_inventories (updated_by);

create table if not exists business_inventory_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  inventory_id uuid not null,
  position int not null default 0,
  item_group text not null check (item_group in ('fixed_asset', 'inventory_item', 'stock', 'intangible', 'cash', 'bank', 'receivable', 'debt', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 300),
  quantity numeric(14,3) check (quantity is null or quantity >= 0),
  unit text not null default '' check (char_length(unit) <= 20),
  value numeric(14,2) not null check (value >= 0 and value < 1e12),
  document text not null default '' check (char_length(document) <= 160),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint business_inventory_items_inventory foreign key (inventory_id, team_id) references business_inventories (id, team_id) on delete cascade
);
create index if not exists business_inventory_items_inventory_idx on business_inventory_items (inventory_id, team_id, position);
create index if not exists business_inventory_items_team_idx on business_inventory_items (team_id);
create index if not exists business_inventory_items_created_by_idx on business_inventory_items (created_by);
create index if not exists business_inventory_items_updated_by_idx on business_inventory_items (updated_by);

create table if not exists business_files (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  entry_id uuid,
  asset_id uuid,
  path text not null unique check (char_length(path) <= 400),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  size bigint not null check (size between 1 and 20971520),
  mime text not null check (char_length(mime) <= 100),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Kept under the team's own folder: "<team id>/…".
  check (split_part(path, '/', 1) = team_id::text),
  constraint business_files_entry foreign key (entry_id, team_id) references business_entries (id, team_id) on delete cascade,
  constraint business_files_asset foreign key (asset_id, team_id) references business_assets (id, team_id) on delete cascade
);
create index if not exists business_files_entry_idx on business_files (entry_id, team_id);
create index if not exists business_files_asset_idx on business_files (asset_id, team_id);
create index if not exists business_files_team_idx on business_files (team_id);
create index if not exists business_files_created_by_idx on business_files (created_by);

-- Lines of the fiscal register that aren't cash: income in kind (products received for a promotion, at market value),
-- an expense the cash book doesn't show, a correction. Kept per year and income source.
create table if not exists business_ref_lines (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  source_id uuid not null,
  kind text not null check (kind in ('income', 'expense')),
  label text not null check (char_length(btrim(label)) between 1 and 200),
  amount numeric(14,2) not null check (amount <> 0 and abs(amount) < 1e12),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint business_ref_lines_source foreign key (source_id, team_id) references business_sources (id, team_id)
);
create index if not exists business_ref_lines_team_year_idx on business_ref_lines (team_id, year);
create index if not exists business_ref_lines_source_idx on business_ref_lines (source_id, team_id);
create index if not exists business_ref_lines_created_by_idx on business_ref_lines (created_by);
create index if not exists business_ref_lines_updated_by_idx on business_ref_lines (updated_by);

create table if not exists business_history (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  item text not null check (item in ('profile', 'source', 'year', 'entry', 'asset', 'inventory', 'inventory_item', 'file', 'ref_line')),
  item_id text not null,
  action text not null check (action in ('add', 'change', 'remove', 'close', 'reopen')),
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
create index if not exists business_history_item_idx on business_history (team_id, item, item_id, changed_at);
create index if not exists business_history_changed_by_idx on business_history (changed_by);

-- ---- 6. The rules --------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['business_profiles', 'business_sources', 'business_years', 'business_entries', 'business_assets', 'business_inventories', 'business_inventory_items', 'business_files', 'business_ref_lines', 'business_history'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('drop policy if exists "business people read" on %I', t);
    execute format('create policy "business people read" on %I for select to authenticated using (team_id in (select business_team_ids()))', t);
    if t not in ('business_years', 'business_history') then
      execute format('grant select, insert, update, delete on %I to authenticated', t);
      execute format('drop policy if exists "business editors add" on %I', t);
      execute format('create policy "business editors add" on %I for insert to authenticated with check (team_id in (select business_edit_team_ids()))', t);
      execute format('drop policy if exists "business editors change" on %I', t);
      execute format('create policy "business editors change" on %I for update to authenticated using (team_id in (select business_edit_team_ids())) with check (team_id in (select business_edit_team_ids()))', t);
      execute format('drop policy if exists "business editors remove" on %I', t);
      execute format('create policy "business editors remove" on %I for delete to authenticated using (team_id in (select business_edit_team_ids()))', t);
    else
      -- A year is closed, reopened and marked rectified through business_set_year; the history is the database's.
      execute format('grant select on %I to authenticated', t);
    end if;
  end loop;
end $$;
revoke all on sequence business_history_id_seq from anon, authenticated;

-- ---- 7. Locks, stamps and the history --------------------------------------------

-- Is that day's year closed for the team?
create or replace function business_year_closed(p_team uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_day is not null and exists (
    select 1 from business_years y
     where y.team_id = p_team and y.year = extract(year from p_day)::int and y.closed_at is not null
  );
$$;
revoke all on function business_year_closed(uuid, date) from public, anon, authenticated;

-- Is any year from one day's to another's closed for the team?
create or replace function business_closed_between(p_team uuid, p_from date, p_to date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_from is not null and p_to is not null and exists (
    select 1 from business_years y
     where y.team_id = p_team and y.closed_at is not null
       and y.year between extract(year from least(p_from, p_to))::int and extract(year from greatest(p_from, p_to))::int
  );
$$;
revoke all on function business_closed_between(uuid, date, date) from public, anon, authenticated;

-- Who and when (the database's), the team a row stays on, and the closed years.
create or replace function business_row_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_msg constant text := 'That year is closed. Reopen it in Business → Settings to change it.';
  old_day date;
  new_day date;
begin
  if tg_op = 'UPDATE' and new.team_id is distinct from old.team_id then
    raise exception 'A business row stays on its team.' using errcode = '42501';
  end if;

  if tg_table_name = 'business_entries' then
    if tg_op <> 'INSERT' then old_day := old.entry_date; end if;
    if tg_op <> 'DELETE' then new_day := new.entry_date; end if;
  elsif tg_table_name = 'business_inventories' then
    if tg_op <> 'INSERT' then old_day := old.taken_on; end if;
    if tg_op <> 'DELETE' then new_day := new.taken_on; end if;
  elsif tg_table_name = 'business_inventory_items' then
    if tg_op <> 'INSERT' then select taken_on into old_day from business_inventories where id = old.inventory_id; end if;
    if tg_op <> 'DELETE' then select taken_on into new_day from business_inventories where id = new.inventory_id; end if;
  elsif tg_table_name = 'business_ref_lines' then
    if tg_op <> 'INSERT' then old_day := make_date(old.year, 1, 1); end if;
    if tg_op <> 'DELETE' then new_day := make_date(new.year, 1, 1); end if;
  elsif tg_table_name = 'business_assets' then
    -- An asset's plan reaches every year it's amortized in (and the one it's sold or scrapped in, if later): while one
    -- of those is closed, what the plan is made of stays. Selling or scrapping it is written down in a year that's open.
    if tg_op = 'DELETE'
       or (tg_op = 'UPDATE' and (new.value, new.life_months, new.method, new.in_service_on, new.acquired_on, new.car_cap)
                                 is distinct from (old.value, old.life_months, old.method, old.in_service_on, old.acquired_on, old.car_cap)) then
      if business_closed_between(old.team_id, old.in_service_on,
                                 greatest((old.in_service_on + make_interval(months => old.life_months + 1))::date, old.disposed_on)) then
        raise exception '%', closed_msg using errcode = 'BIZ01';
      end if;
    end if;
    if tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and (new.value, new.life_months, new.method, new.in_service_on, new.acquired_on, new.car_cap)
                                 is distinct from (old.value, old.life_months, old.method, old.in_service_on, old.acquired_on, old.car_cap)) then
      if business_closed_between(new.team_id, new.in_service_on,
                                 greatest((new.in_service_on + make_interval(months => new.life_months + 1))::date, new.disposed_on)) then
        raise exception '%', closed_msg using errcode = 'BIZ01';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.disposed_on is distinct from old.disposed_on
       and business_closed_between(new.team_id, least(old.disposed_on, new.disposed_on),
                                   greatest(old.disposed_on, new.disposed_on, (new.in_service_on + make_interval(months => new.life_months + 1))::date)) then
      raise exception '%', closed_msg using errcode = 'BIZ01';
    end if;
  end if;

  if (old_day is not null and business_year_closed(old.team_id, old_day))
     or (new_day is not null and business_year_closed(new.team_id, new_day)) then
    raise exception '%', closed_msg using errcode = 'BIZ01';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_table_name in ('business_entries', 'business_assets', 'business_inventories', 'business_inventory_items', 'business_ref_lines') then
    if tg_op = 'INSERT' then
      new.created_by := coalesce(auth.uid(), new.created_by);
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  elsif tg_table_name = 'business_profiles' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  elsif tg_table_name = 'business_files' then
    if tg_op = 'INSERT' then
      new.created_by := coalesce(auth.uid(), new.created_by);
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function business_row_guard() from public, anon, authenticated;

-- Every change, kept (who, when, what it was and what it became).
create or replace function business_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := case tg_table_name
    when 'business_profiles' then 'profile'
    when 'business_sources' then 'source'
    when 'business_entries' then 'entry'
    when 'business_assets' then 'asset'
    when 'business_inventories' then 'inventory'
    when 'business_inventory_items' then 'inventory_item'
    when 'business_files' then 'file'
    when 'business_ref_lines' then 'ref_line'
  end;
  row_team uuid;
  row_id text;
begin
  if tg_op = 'DELETE' then
    row_team := old.team_id;
    row_id := case when tg_table_name = 'business_profiles' then old.team_id::text else (to_jsonb(old) ->> 'id') end;
  else
    row_team := new.team_id;
    row_id := case when tg_table_name = 'business_profiles' then new.team_id::text else (to_jsonb(new) ->> 'id') end;
  end if;
  -- A team going away takes its history with it (nothing to keep it for).
  if not exists (select 1 from teams where id = row_team) then
    return null;
  end if;
  insert into business_history (team_id, item, item_id, action, changed_by, before, after)
  values (
    row_team, kind, row_id,
    case tg_op when 'INSERT' then 'add' when 'UPDATE' then 'change' else 'remove' end,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function business_log() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['business_profiles', 'business_sources', 'business_entries', 'business_assets', 'business_inventories', 'business_inventory_items', 'business_files', 'business_ref_lines'] loop
    execute format('drop trigger if exists business_row_guard on %I', t);
    execute format('create trigger business_row_guard before insert or update or delete on %I for each row execute function business_row_guard()', t);
    execute format('drop trigger if exists business_log on %I', t);
    execute format('create trigger business_log after insert or update or delete on %I for each row execute function business_log()', t);
  end loop;
end $$;

-- ---- 8. Closing a year, and its "Rectificare" ----------------------------------------

-- p_closed / p_rectified null: left as they are. Someone who may edit the team's Business; answers the year as it is now.
create or replace function business_set_year(p_team uuid, p_year int, p_closed boolean, p_rectified boolean)
returns table (year int, closed_at timestamptz, closed_by uuid, rectified boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  was business_years%rowtype;
  now_row business_years%rowtype;
begin
  if auth.uid() is null or p_team is null or p_team not in (select business_edit_team_ids()) then
    raise exception 'Only the people who may edit this Business close or reopen its years.' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'That isn''t a year we keep.' using errcode = '22023';
  end if;
  select * into was from business_years y where y.team_id = p_team and y.year = p_year;
  insert into business_years as y (team_id, year, closed_at, closed_by, rectified)
  values (
    p_team, p_year,
    case when coalesce(p_closed, false) then now() else null end,
    case when coalesce(p_closed, false) then auth.uid() else null end,
    coalesce(p_rectified, false)
  )
  on conflict on constraint business_years_pkey do update set
    closed_at = case when p_closed is null then y.closed_at when p_closed then coalesce(y.closed_at, now()) else null end,
    closed_by = case when p_closed is null then y.closed_by when p_closed then coalesce(y.closed_by, auth.uid()) else null end,
    rectified = coalesce(p_rectified, y.rectified)
  returning * into now_row;
  if (was.closed_at is not null) is distinct from (now_row.closed_at is not null) then
    insert into business_history (team_id, item, item_id, action, changed_by, before, after)
    values (p_team, 'year', p_year::text, case when now_row.closed_at is null then 'reopen' else 'close' end, auth.uid(),
            case when was.team_id is null then null else to_jsonb(was) end, to_jsonb(now_row));
  elsif coalesce(was.rectified, false) is distinct from now_row.rectified then
    insert into business_history (team_id, item, item_id, action, changed_by, before, after)
    values (p_team, 'year', p_year::text, 'change', auth.uid(), case when was.team_id is null then null else to_jsonb(was) end, to_jsonb(now_row));
  end if;
  return query select now_row.year, now_row.closed_at, now_row.closed_by, now_row.rectified;
end;
$$;
revoke all on function business_set_year(uuid, int, boolean, boolean) from public, anon;
grant execute on function business_set_year(uuid, int, boolean, boolean) to authenticated;

-- ---- 9. The documents (private) -----------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-docs', 'business-docs', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/xml', 'text/xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "business docs: business people read" on storage.objects;
create policy "business docs: business people read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and (storage.foldername(name))[1] in (select t::text from business_team_ids() t));
drop policy if exists "business docs: editors add" on storage.objects;
create policy "business docs: editors add" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and (storage.foldername(name))[1] in (select t::text from business_edit_team_ids() t));
drop policy if exists "business docs: editors replace" on storage.objects;
create policy "business docs: editors replace" on storage.objects for update to authenticated
  using (bucket_id = 'business-docs' and (storage.foldername(name))[1] in (select t::text from business_edit_team_ids() t))
  with check (bucket_id = 'business-docs' and (storage.foldername(name))[1] in (select t::text from business_edit_team_ids() t));
drop policy if exists "business docs: editors remove" on storage.objects;
create policy "business docs: editors remove" on storage.objects for delete to authenticated
  using (bucket_id = 'business-docs' and (storage.foldername(name))[1] in (select t::text from business_edit_team_ids() t));
