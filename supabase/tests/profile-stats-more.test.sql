-- Checks for 0100: what profile_stats counts for the new achievements (1.29.6):
-- longer streaks, more levels, a 5th team, steps finished early, at night or
-- at dawn (the team's time zone; publishing left out; a time zone Postgres
-- can't read counts as UTC), and videos worked on. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000100a1', 'r-more@example.com') on conflict do nothing;
insert into profiles (id, email) values ('00000000-0000-4000-8000-0000000100a1', 'r-more@example.com') on conflict do nothing;
insert into teams (id, name, slug, owner_id, timezone) values
  ('10000000-0000-4000-8000-0000000100a1', 'Tokyo', 'more-tokyo', '00000000-0000-4000-8000-0000000100a1', 'Asia/Tokyo'),
  ('10000000-0000-4000-8000-0000000100a3', 'Three', 'more-three', '00000000-0000-4000-8000-0000000100a1', 'UTC'),
  ('10000000-0000-4000-8000-0000000100a4', 'Four', 'more-four', '00000000-0000-4000-8000-0000000100a1', 'UTC'),
  ('10000000-0000-4000-8000-0000000100a5', 'Five', 'more-five', '00000000-0000-4000-8000-0000000100a1', 'UTC')
on conflict do nothing;
-- A time zone Postgres can't read (teams refuse one since 0027; one from before, or gone from a newer tz list, could still
-- be there): added past the check.
set session_replication_role = replica;
insert into teams (id, name, slug, owner_id, timezone) values
  ('10000000-0000-4000-8000-0000000100a2', 'Nowhere', 'more-nowhere', '00000000-0000-4000-8000-0000000100a1', 'Mars/Olympus')
on conflict do nothing;
set session_replication_role = default;

-- 14 days in a row (Mar 1 to 14), an edited short each day at noon UTC, each 5 days before its date (early).
insert into tasks (team_id, user_id, kind, item_id, stage, state, due_date, activated_at, completed_at)
select '10000000-0000-4000-8000-0000000100a1', '00000000-0000-4000-8000-0000000100a1', 'short',
       ('20000000-0000-4000-8000-0000001001' || lpad(k::text, 2, '0'))::uuid, 'editing', 'done',
       date '2026-03-06' + k, timestamptz '2026-03-01 11:00Z' + k * interval '1 day', timestamptz '2026-03-01 12:00Z' + k * interval '1 day'
  from generate_series(0, 13) as k;
-- 30 long edits on the last day (enough XP for level 20).
insert into tasks (team_id, user_id, kind, item_id, stage, state, activated_at, completed_at)
select '10000000-0000-4000-8000-0000000100a3', '00000000-0000-4000-8000-0000000100a1', 'long',
       ('20000000-0000-4000-8000-0000001002' || lpad(j::text, 2, '0'))::uuid, 'edit', 'done',
       timestamptz '2026-03-14 12:00Z', timestamptz '2026-03-14 13:00Z' + j * interval '1 minute'
  from generate_series(0, 29) as j;
insert into tasks (team_id, user_id, kind, item_id, stage, state, activated_at, completed_at) values
  -- 17:30 UTC is 02:30 in Tokyo: at night.
  ('10000000-0000-4000-8000-0000000100a1', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100301', 'script', 'done', '2026-03-05 10:00Z', '2026-03-05 17:30Z'),
  -- 03:00 in Tokyo, but sending a video out: not counted.
  ('10000000-0000-4000-8000-0000000100a1', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100302', 'ready', 'done', '2026-03-05 10:00Z', '2026-03-05 18:00Z'),
  -- A time zone Postgres doesn't know: UTC, so 03:00 is at night.
  ('10000000-0000-4000-8000-0000000100a2', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100303', 'script', 'done', '2026-03-07 01:00Z', '2026-03-07 03:00Z'),
  -- 21:30 UTC is 06:30 in Tokyo: at dawn.
  ('10000000-0000-4000-8000-0000000100a1', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100304', 'review', 'done', '2026-03-08 20:00Z', '2026-03-08 21:30Z'),
  -- Teams four and five.
  ('10000000-0000-4000-8000-0000000100a4', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100305', 'script', 'done', '2026-03-10 10:00Z', '2026-03-10 12:00Z'),
  ('10000000-0000-4000-8000-0000000100a5', '00000000-0000-4000-8000-0000000100a1', 'short', '20000000-0000-4000-8000-000000100306', 'script', 'done', '2026-03-10 10:00Z', '2026-03-10 12:30Z');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000100a1');
  set local role authenticated;
  create temp table st on commit drop as select profile_stats('00000000-0000-4000-8000-0000000100a1') as j;
  do $$
  declare
    j jsonb := (select j from st);
  begin
    -- What 0093 answered is still there.
    if (j->>'tasks')::int <> 50 or (j->>'teams')::int <> 5 or (j->>'videos')::int <> 50 or (j->'streak'->>'best')::int <> 14 then
      raise exception '1: the old numbers changed: tasks %, teams %, videos %, best %', j->>'tasks', j->>'teams', j->>'videos', j->'streak'->>'best';
    end if;
    if (j->>'xp')::int <> 3545 then
      raise exception '1: XP should be 3545, is %', j->>'xp';
    end if;
    -- 2. A 14 day streak, and when (its 14th day).
    if j->'streak'->'dates'->>'14' is distinct from '2026-03-14' or j->'streak'->'dates' ? '30' then
      raise exception '2: streak dates are off: %', j->'streak'->'dates';
    end if;
    -- 3. Level 20 (3000 XP) reached, not 25.
    if not (j->'levels' ? '20') or j->'levels' ? '25' then
      raise exception '3: levels are off: %', j->'levels';
    end if;
    -- 4. The 5th team.
    if not (j->'team_dates' ? '5') then
      raise exception '4: the 5th team should have a date: %', j->'team_dates';
    end if;
    -- 5. Early: the 14 shorts.
    if (j->'more'->'early'->>'n')::int <> 14 or not (j->'more'->'early'->'at' ? '10') or j->'more'->'early'->'at' ? '50' then
      raise exception '5: early is off: %', j->'more'->'early';
    end if;
    -- 6. At night: Tokyo's 02:30 and the unknown zone's 03:00 UTC, not the post; at dawn: Tokyo's 06:30.
    if (j->'more'->'night'->>'n')::int <> 2 or (j->'more'->'dawn'->>'n')::int <> 1 then
      raise exception '6: night % and dawn % are off', j->'more'->'night', j->'more'->'dawn';
    end if;
    if (j->'more'->'night'->'at'->>'1')::timestamptz <> timestamptz '2026-03-05 17:30Z' then
      raise exception '6: the first night should be Mar 5 17:30 UTC: %', j->'more'->'night';
    end if;
    -- 7. Videos worked on: 50, dated at 10, 25 and 50.
    if (j->'more'->'videos'->>'n')::int <> 50 or not (j->'more'->'videos'->'at' ?& array['10', '25', '50']) or j->'more'->'videos'->'at' ? '100' then
      raise exception '7: videos are off: %', j->'more'->'videos';
    end if;
  end;
  $$;
commit;

-- 8. The helpers.
do $$
begin
  if vp_safe_tz('Mars/Olympus') <> 'UTC' or vp_safe_tz(null) <> 'UTC' or vp_safe_tz('Asia/Tokyo') <> 'Asia/Tokyo' then
    raise exception '8: vp_safe_tz is off';
  end if;
  if vp_marks(null, array[1]) <> '{"n": 0, "at": {}}'::jsonb then
    raise exception '8: vp_marks of nothing is off: %', vp_marks(null, array[1]);
  end if;
end;
$$;
