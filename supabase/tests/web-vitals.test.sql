-- Checks for 0110 (real visitors' speed, 1.32.4): web_vitals is the
-- server's only (no visitor or signed-in person can read or write it, even
-- with the public key), its limits hold, a measure that grows replaces its
-- row, and web_vitals_summary gives the 75th percentile per device and per
-- page for the days asked (1 to 30), and only to the service key.
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- 1. Nobody but the server.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.web_vitals'::regclass) then
    raise exception 'FAIL 1: web_vitals without row-level security';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'web_vitals') then
    raise exception 'FAIL 1: web_vitals has a rule (it is the server''s only)';
  end if;
  if has_table_privilege('anon', 'public.web_vitals', 'select') or has_table_privilege('anon', 'public.web_vitals', 'insert')
     or has_table_privilege('authenticated', 'public.web_vitals', 'select') or has_table_privilege('authenticated', 'public.web_vitals', 'insert')
     or has_table_privilege('authenticated', 'public.web_vitals', 'update') or has_table_privilege('authenticated', 'public.web_vitals', 'delete') then
    raise exception 'FAIL 1: visitors or signed-in people have rights on web_vitals';
  end if;
  if has_function_privilege('authenticated', 'public.web_vitals_summary(integer)', 'execute') or has_function_privilege('anon', 'public.web_vitals_summary(integer)', 'execute') then
    raise exception 'FAIL 1: web_vitals_summary is open to visitors or signed-in people';
  end if;
  if not has_function_privilege('service_role', 'public.web_vitals_summary(integer)', 'execute') then
    raise exception 'FAIL 1: the service key can''t read the summary';
  end if;
end $$;

-- 2. The limits.
do $$
declare
  bad text[] := array[
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-1-bad1', 'FID', 10, 'good', '/x', 'phone')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-1-bad2', 'LCP', -1, 'good', '/x', 'phone')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-1-bad3', 'LCP', 10, 'great', '/x', 'phone')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-1-bad4', 'LCP', 10, 'good', '/x', 'tablet')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device, connection) values ('v4-1-bad5', 'LCP', 10, 'good', '/x', 'phone', '5g')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('x', 'LCP', 10, 'good', '/x', 'phone')$q$,
    $q$insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-1-bad7', 'LCP', 10, 'good', repeat('a', 201), 'phone')$q$
  ];
  q text;
begin
  foreach q in array bad loop
    begin
      execute q;
      raise exception 'FAIL 2: accepted %', q;
    exception when check_violation then
      null;
    end;
  end loop;
end $$;

-- 3. Some visits: phones slower than computers; one page slow.
insert into web_vitals (vital_id, metric, value, rating, page, device, at)
select 'v4-110-p' || g, 'LCP', g * 100, case when g * 100 <= 2500 then 'good' when g * 100 > 4000 then 'poor' else 'needs-improvement' end, '/dashboard', 'phone', now() - interval '1 hour'
  from generate_series(1, 40) g;
insert into web_vitals (vital_id, metric, value, rating, page, device, at)
select 'v4-110-c' || g, 'LCP', g * 50, 'good', case when g <= 10 then '/videos/[id]' else '/dashboard' end, 'computer', now() - interval '2 hours'
  from generate_series(1, 20) g;
-- Older than the week: not counted in 7 days, counted in 30.
insert into web_vitals (vital_id, metric, value, rating, page, device, at)
values ('v4-110-old', 'LCP', 99999, 'poor', '/dashboard', 'phone', now() - interval '20 days');
-- A measure that grew (CLS when the tab came back): the same id replaces it.
insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-110-cls', 'CLS', 0.02, 'good', '/dashboard', 'computer');
insert into web_vitals (vital_id, metric, value, rating, page, device) values ('v4-110-cls', 'CLS', 0.3, 'poor', '/dashboard', 'computer')
  on conflict (vital_id) do update set value = excluded.value, rating = excluded.rating;

do $$
declare
  r record;
begin
  if (select count(*) from web_vitals where vital_id = 'v4-110-cls') <> 1 or (select value from web_vitals where vital_id = 'v4-110-cls') <> 0.3 then
    raise exception 'FAIL 3: a grown measure should replace its row';
  end if;

  select * into r from web_vitals_summary(7) where metric = 'LCP' and device = 'phone' and page is null;
  -- 40 phone loads of 100..4000 ms: the 75th percentile is 3025 ms; 25 good (<= 2500), none poor (<= 4000).
  if r.loads <> 40 or abs(r.p75 - 3025) > 0.001 or r.good <> 25 or r.poor <> 0 then
    raise exception 'FAIL 3: phones, 7 days: % loads, p75 %, % good, % poor (want 40, 3025, 25, 0)', r.loads, r.p75, r.good, r.poor;
  end if;
  select * into r from web_vitals_summary(7) where metric = 'LCP' and device = 'computer' and page is null;
  if r.loads <> 20 or abs(r.p75 - 762.5) > 0.001 then
    raise exception 'FAIL 3: computers: % loads, p75 % (want 20, 762.5)', r.loads, r.p75;
  end if;
  select * into r from web_vitals_summary(7) where metric = 'LCP' and page = '/videos/[id]' and device is null;
  if r.loads <> 10 or abs(r.p75 - 387.5) > 0.001 then
    raise exception 'FAIL 3: a page across devices: % loads, p75 % (want 10, 387.5)', r.loads, r.p75;
  end if;
  select * into r from web_vitals_summary(30) where metric = 'LCP' and device = 'phone' and page is null;
  if r.loads <> 41 or r.poor <> 1 then
    raise exception 'FAIL 3: 30 days counts the older one: % loads, % poor', r.loads, r.poor;
  end if;
  if (select count(*) from web_vitals_summary(9999) where metric = 'LCP' and device = 'phone' and page is null and loads = 41) <> 1
     or (select count(*) from web_vitals_summary(0) where metric = 'LCP' and device = 'phone' and page is null and loads = 40) <> 1 then
    raise exception 'FAIL 3: the days asked stay between 1 and 30';
  end if;
end $$;

-- 4. Signed in, with the public key: nothing.
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;
do $$
declare
  n int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000110a01', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    execute 'select count(*) from web_vitals' into n;
    raise exception 'FAIL 4: a signed-in person read web_vitals (% rows)', n;
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform * from web_vitals_summary(7);
    raise exception 'FAIL 4: a signed-in person read the summary';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

delete from web_vitals where vital_id like 'v4-110-%';

select 'web-vitals checks passed' as ok;
