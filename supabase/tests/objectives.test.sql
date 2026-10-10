-- Access and behaviour checks for 0078 (objectives): who may read and write
-- goals, period targets and progress, how the server records a win (once per
-- target, quietly when asked), the throttle, what a redefinition clears, the
-- 50-per-team limit and realtime. Run by scripts/db/test-from-scratch.sh on
-- the database the migrations just built (stub + every migration); each check
-- raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- People: M = master of team A, X = editor in team A, O = master of team B.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'm@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'x@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'o@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'm@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'x@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'o@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-00000000000a', 'Team A', 'team-a', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-00000000000b', 'Team B', 'team-b', '00000000-0000-4000-8000-0000000000b1')
on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'x@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values ('20000000-0000-4000-8000-0000000000a2', 'editor') on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 1. Masters add objectives; created_by is stamped; teammates read; outsiders don't.
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
  set local role authenticated;
  insert into objectives (id, team_id, title, metric, period, target, filters, color)
  values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-00000000000a', '  Shorts a week  ', 'shorts_posted', 'week', 14, '{"platforms":["instagram"],"only":true}', 'blue');
commit;
do $$ begin
  if (select created_by from objectives where id = '30000000-0000-4000-8000-000000000001') <> '00000000-0000-4000-8000-0000000000a1' then raise exception 'FAIL 1: created_by not stamped'; end if;
  if (select title from objectives where id = '30000000-0000-4000-8000-000000000001') <> 'Shorts a week' then raise exception 'FAIL 1: title not trimmed'; end if;
end $$;

begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
  set local role authenticated;
  do $$ begin
    if (select count(*) from objectives) <> 1 then raise exception 'FAIL 1: teammate should see 1 objective'; end if;
  end $$;
commit;
begin;
  select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1');
  set local role authenticated;
  do $$ begin
    if (select count(*) from objectives) <> 0 then raise exception 'FAIL 1: outsider sees objectives'; end if;
  end $$;
commit;

-- 2. Non-masters can't add, change or remove; outsiders can't add to another team.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into objectives (team_id, title, metric, period, target) values ('10000000-0000-4000-8000-00000000000a', 'Nope', 'views', 'month', 10);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 2: editor added an objective'; end if;
  update objectives set target = 1 where id = '30000000-0000-4000-8000-000000000001';
  if found then raise exception 'FAIL 2: editor changed an objective'; end if;
  delete from objectives where id = '30000000-0000-4000-8000-000000000001';
  if found then raise exception 'FAIL 2: editor removed an objective'; end if;
  reset role;
end $$;
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into objectives (team_id, title, metric, period, target) values ('10000000-0000-4000-8000-00000000000a', 'Sneaky', 'views', 'month', 10);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 2: outsider added an objective to team A'; end if;
  reset role;
end $$;

-- 3. Masters change what they may; created_by / team can't be changed.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update objectives set target = 12, title = 'Shorts' where id = '30000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL 3: master could not change the target'; end if;
  begin
    update objectives set created_by = '00000000-0000-4000-8000-0000000000a2' where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: created_by was writable'; end if;
  begin
    update objectives set team_id = '10000000-0000-4000-8000-00000000000b' where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: team_id was writable'; end if;
  begin
    update objectives set period = 'fortnight' where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: bad period accepted'; end if;
  begin
    update objectives set metric = 'Views!' where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: bad metric accepted'; end if;
  begin
    update objectives set filters = '[1,2]' where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: filters must be an object'; end if;
  begin
    update objectives set target = 0 where id = '30000000-0000-4000-8000-000000000001';
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 3: target 0 accepted'; end if;
  reset role;
end $$;

-- 4. Per-period targets: the master sets one on a Monday; not on a Tuesday;
--    the team comes from the objective; the editor can't; outsiders can't read.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  insert into objective_targets (objective_id, period_start, team_id, target) values ('30000000-0000-4000-8000-000000000001', '2026-10-05', '10000000-0000-4000-8000-00000000000b', 8);
  begin
    insert into objective_targets (objective_id, period_start, target) values ('30000000-0000-4000-8000-000000000001', '2026-10-06', 8);
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 4: a Tuesday was accepted for a weekly goal'; end if;
  update objective_targets set target = 0 where objective_id = '30000000-0000-4000-8000-000000000001' and period_start = '2026-10-05';
  if not found then raise exception 'FAIL 4: master could not change a period target'; end if;
  reset role;
end $$;
do $$ begin
  if (select team_id from objective_targets where period_start = '2026-10-05') <> '10000000-0000-4000-8000-00000000000a' then raise exception 'FAIL 4: team not taken from the objective'; end if;
  if (select updated_by from objective_targets where period_start = '2026-10-05') <> '00000000-0000-4000-8000-0000000000a1' then raise exception 'FAIL 4: updated_by not stamped'; end if;
end $$;
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  if (select count(*) from objective_targets) <> 1 then raise exception 'FAIL 4: teammate should read the period target'; end if;
  begin
    insert into objective_targets (objective_id, period_start, target) values ('30000000-0000-4000-8000-000000000001', '2026-10-12', 3);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 4: editor set a period target'; end if;
  update objective_targets set target = 99;
  if found then raise exception 'FAIL 4: editor changed a period target'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
  set local role authenticated;
  if (select count(*) from objective_targets) <> 0 then raise exception 'FAIL 4: outsider reads period targets'; end if;
  reset role;
end $$;

-- 5. Progress is server-only: nobody writes it from the browser; teammates read it.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into objective_periods (objective_id, period_start, team_id, period_end, target, value) values ('30000000-0000-4000-8000-000000000001', '2026-10-05', '10000000-0000-4000-8000-00000000000a', '2026-10-11', 1, 99);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 5: master wrote progress by hand'; end if;
  begin
    perform objective_record('[]'::jsonb);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 5: authenticated may call objective_record'; end if;
  begin
    perform objective_claim_sync('10000000-0000-4000-8000-00000000000a', 0);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL 5: authenticated may call objective_claim_sync'; end if;
  reset role;
end $$;

-- 6. objective_record (the server): saves progress, claims a win once,
--    again only past a raised target, quietly when asked, skips gone objectives.
set role service_role;
do $$
declare n int;
begin
  -- 9 of 12: saved, not reached.
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-12","period_end":"2026-10-18","target":12,"value":9}]');
  if n <> 0 then raise exception 'FAIL 6: 9 of 12 counted as a win'; end if;
  if (select value from objective_periods where period_start = '2026-10-12') <> 9 then raise exception 'FAIL 6: progress not saved'; end if;
  -- 12 of 12: the win, once.
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-12","period_end":"2026-10-18","target":12,"value":12,"reached_at":"2026-10-15T15:00:00Z","winner":{"kind":"short","number":231}}]');
  if n <> 1 then raise exception 'FAIL 6: reaching the target was not a win'; end if;
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-12","period_end":"2026-10-18","target":12,"value":13}]');
  if n <> 0 then raise exception 'FAIL 6: the same period won twice'; end if;
  if (select reached_at from objective_periods where period_start = '2026-10-12') <> '2026-10-15T15:00:00Z'::timestamptz then raise exception 'FAIL 6: reached_at not kept'; end if;
  if (select (winner->>'number')::int from objective_periods where period_start = '2026-10-12') <> 231 then raise exception 'FAIL 6: winner not kept'; end if;
  -- Raised to 15: reached again only at 15.
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-12","period_end":"2026-10-18","target":15,"value":13}]');
  if n <> 0 then raise exception 'FAIL 6: 13 of 15 counted as a win'; end if;
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-12","period_end":"2026-10-18","target":15,"value":15}]');
  if n <> 1 then raise exception 'FAIL 6: the raised target was not a new win'; end if;
  if (select reached_target from objective_periods where period_start = '2026-10-12') <> 15 then raise exception 'FAIL 6: reached_target not updated'; end if;
  -- Quiet: recorded, not returned, celebrated_at untouched (null for a first quiet win).
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-19","period_end":"2026-10-25","target":12,"value":20,"quiet":true}]');
  if n <> 0 then raise exception 'FAIL 6: a quiet win was returned'; end if;
  if (select reached_at is null or celebrated_at is not null from objective_periods where period_start = '2026-10-19') then raise exception 'FAIL 6: quiet win not recorded quietly'; end if;
  -- Target 0 (off): never a win.
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-000000000001","period_start":"2026-10-26","period_end":"2026-11-01","target":0,"value":5}]');
  if n <> 0 then raise exception 'FAIL 6: an off period was a win'; end if;
  -- A deleted objective: skipped, no row.
  select count(*) into n from objective_record('[{"objective_id":"30000000-0000-4000-8000-0000000000ff","period_start":"2026-10-12","period_end":"2026-10-18","target":1,"value":5}]');
  if n <> 0 or exists (select 1 from objective_periods where objective_id = '30000000-0000-4000-8000-0000000000ff') then raise exception 'FAIL 6: a missing objective got progress'; end if;
  -- Not a list: refused.
  begin
    perform objective_record('{}'::jsonb);
    raise exception 'FAIL 6: a non-list was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- 7. Teammates read progress; outsiders don't.
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  if (select count(*) from objective_periods) < 3 then raise exception 'FAIL 7: teammate should read progress'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
  set local role authenticated;
  if (select count(*) from objective_periods) <> 0 then raise exception 'FAIL 7: outsider reads progress'; end if;
  reset role;
end $$;

-- 8. objective_claim_sync: one caller at a time.
set role service_role;
do $$ begin
  if not objective_claim_sync('10000000-0000-4000-8000-00000000000a', 30) then raise exception 'FAIL 8: first claim refused'; end if;
end $$;
do $$ begin
  if objective_claim_sync('10000000-0000-4000-8000-00000000000a', 30) then raise exception 'FAIL 8: second claim within 30 s allowed'; end if;
end $$;
select pg_sleep(0.05);
do $$ begin
  if not objective_claim_sync('10000000-0000-4000-8000-00000000000a', 0) then raise exception 'FAIL 8: claim with 0 s refused'; end if;
end $$;
reset role;

-- 9. Changing what it counts clears its record; changing the period clears its period targets.
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  update objectives set target = 20 where id = '30000000-0000-4000-8000-000000000001';
  reset role;
  if (select count(*) from objective_periods where objective_id = '30000000-0000-4000-8000-000000000001') < 3 then raise exception 'FAIL 9: a target change cleared the record'; end if;
  set local role authenticated;
  update objectives set filters = '{"platforms":["tiktok"],"only":true}' where id = '30000000-0000-4000-8000-000000000001';
  reset role;
  if (select count(*) from objective_periods where objective_id = '30000000-0000-4000-8000-000000000001') <> 0 then raise exception 'FAIL 9: new filters kept the old record'; end if;
  if (select count(*) from objective_targets where objective_id = '30000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FAIL 9: new filters dropped the period targets'; end if;
  set local role authenticated;
  update objectives set period = 'month' where id = '30000000-0000-4000-8000-000000000001';
  reset role;
  if (select count(*) from objective_targets where objective_id = '30000000-0000-4000-8000-000000000001') <> 0 then raise exception 'FAIL 9: a new period kept weekly targets'; end if;
end $$;

-- 10. At most 50 per team.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  for i in 2..50 loop
    insert into objectives (team_id, title, metric, period, target) values ('10000000-0000-4000-8000-00000000000a', 'Goal ' || i, 'views', 'month', 10);
  end loop;
  begin
    insert into objectives (team_id, title, metric, period, target) values ('10000000-0000-4000-8000-00000000000a', 'Goal 51', 'views', 'month', 10);
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL 10: a 51st objective was accepted'; end if;
  reset role;
end $$;

-- 11. Masters remove objectives (and their record goes with them).
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  delete from objectives where id = '30000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL 11: master could not remove'; end if;
  reset role;
end $$;

-- 12. Realtime has the three tables.
do $$ begin
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('objectives', 'objective_targets', 'objective_periods')) <> 3 then
    raise exception 'FAIL 12: realtime is missing objectives tables';
  end if;
end $$;

select 'ALL OBJECTIVES CHECKS PASSED';
