-- Checks for 0121 (the PFA's activity, CAEN, takes up to 500 characters): 500 are kept whole, 501 are refused, and
-- 0120's 80-character check is gone. Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000121a1', 'o121@example.com') on conflict do nothing;
insert into profiles (id, email) values ('00000000-0000-4000-8000-0000000121a1', 'o121@example.com') on conflict do nothing;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-0000000121a0', 'Team 121', 'team-121', '00000000-0000-4000-8000-0000000121a1') on conflict do nothing;
insert into team_features (team_id, feature) values ('10000000-0000-4000-8000-0000000121a0', 'business') on conflict do nothing;

do $$
declare
  long text := '5911 Activități de producție cinematografică, video și de programe de televiziune; ' || repeat('7311 Activități ale agențiilor de publicitate; ', 20);
begin
  if exists (select 1 from pg_constraint where conrelid = 'business_profiles'::regclass and conname = 'business_profiles_caen_check') then
    raise exception 'FAIL: 0120''s 80-character check on caen is still there';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'business_profiles'::regclass and conname = 'business_profiles_caen_len') then
    raise exception 'FAIL: no check of its own on caen';
  end if;
  insert into business_profiles (team_id, name, caen) values ('10000000-0000-4000-8000-0000000121a0', 'PFA 121', left(long, 500));
  if (select char_length(caen) from business_profiles where team_id = '10000000-0000-4000-8000-0000000121a0') <> 500 then
    raise exception 'FAIL: 500 characters weren''t kept whole';
  end if;
  begin
    update business_profiles set caen = left(long, 500) || 'x' where team_id = '10000000-0000-4000-8000-0000000121a0';
    raise exception 'FAIL: 501 characters were accepted';
  exception when check_violation then null;
  end;
  delete from business_profiles where team_id = '10000000-0000-4000-8000-0000000121a0';
end $$;
