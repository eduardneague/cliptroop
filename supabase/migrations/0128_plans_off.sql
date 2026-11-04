-- 0128 (1.51.0): plans off for now. Every team opens and adds its files without one. The owner (Nov 4 2026), shown
-- "Choose a plan to open your team" on a new account: "remove this for now please, just until i get the tiktok
-- approval thing, lets give access to free accounts for now, and thne we can add this back and connect it to stripe or
-- something".
--
--   * public.plans_required(): the database's switch, false. The app's own is PLANS_REQUIRED in lib/plans.ts: they
--     go back on together.
--   * public.storage_upload_allowed(bucket, name): 0124's rule (anything that isn't a team's, or a team with a plan)
--     only while plans_required() is true; until then any team's files are allowed (each bucket's own policies still
--     decide who may add what, as before).
--   * The rest of 0124 stays as it is: teams.plan (a new team's is still none; ClipTroop sets plans in Developer →
--     Plans), asking for one, and the storage each team uses.
--
-- To turn plans back on: create or replace function public.plans_required() returning true (and PLANS_REQUIRED).
-- supabase/tests/team-plans.test.sql checks both ways. Additive; safe to run twice.

create or replace function public.plans_required()
returns boolean
language sql
stable
as $$
  select false;
$$;
revoke all on function public.plans_required() from public, anon;
grant execute on function public.plans_required() to authenticated, service_role;

-- Whether a file may be added there: anything while plans are off; with them on, anything that isn't a team's, or a
-- team that has a plan (0124).
create or replace function public.storage_upload_allowed(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not public.plans_required()
      or coalesce((select t.plan is not null from teams t where t.id = public.storage_team_of(p_bucket, p_name)), true);
$$;
revoke all on function public.storage_upload_allowed(text, text) from public, anon;
grant execute on function public.storage_upload_allowed(text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
