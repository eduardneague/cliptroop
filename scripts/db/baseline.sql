-- ============================================================================
-- BASELINE — paste into the SQL editor ONCE per Supabase project
-- (staging, then production), before the first push with the Database Action.
--
-- It tells the database tool (Supabase CLI) that migrations 0001 … 0062 were
-- already run by hand, so it only runs 0063 and later. It writes a list in its
-- own little table and changes NOTHING in VPlanner's data. Safe to run twice.
--
-- Already ran 0063 and 0064 by hand too? Change 62 below to 64.
-- ============================================================================
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version, name)
select lpad(n::text, 4, '0'), 'run by hand before 1.8'
  from generate_series(1, 62) as n
on conflict (version) do nothing;

-- Should say 62 (or 64 if you changed the number above).
select count(*) as marked_as_run from supabase_migrations.schema_migrations;
