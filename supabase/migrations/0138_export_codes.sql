-- ============================================================================
-- 0138: A code to export (1.59.0)
-- ============================================================================
-- Exporting the sponsorships table takes two-step sign-in, the password and a code typed then and there (the owner:
-- "you shouldnt be able to export the table without some work"). An authenticator app's code is Supabase's own; for
-- the people who get their codes by email, this is a third kind of code in two_step_codes (0125): 'export', checked
-- only by the export (lib/auth/step-up.ts). A code sent for signing in never exports, and this one never signs in.
--
--   * two_step_codes.purpose: 'sign_in', 'setup' or 'export'.
--   * export_codes_ready(): App setup's check.
--
-- supabase/tests/export-codes.test.sql checks it. Additive (only one more kind is let in); safe to run twice.
-- ============================================================================

-- Whatever 0125's check on the kind was called, it goes, and comes back with the third kind.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.two_step_codes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%purpose%'
  loop
    execute format('alter table public.two_step_codes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.two_step_codes add constraint two_step_codes_purpose_check check (purpose in ('sign_in', 'setup', 'export'));

-- App setup's check (read with the service key).
create or replace function public.export_codes_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.two_step_codes'::regclass and conname = 'two_step_codes_purpose_check'
      and pg_get_constraintdef(oid) like '%''export''%'
  );
$$;
revoke all on function public.export_codes_ready() from public, anon, authenticated;
grant execute on function public.export_codes_ready() to service_role;
