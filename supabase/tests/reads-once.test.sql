-- Checks for 0109 (read rules that asked for every row now ask once,
-- 1.32.0), and guards for every migration after it: no read rule calls a
-- per-row check (a function given the row's own team or project, or a bare
-- auth.uid()), and every reference has an index. Then: the rewritten rules
-- give the same answers as before (money for Masters and the people given
-- access, the social history for Masters and Schedulers, your own words).
-- Run by scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- 1. The guards.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname, qual from pg_policies
     where schemaname = 'public' and cmd in ('SELECT', 'ALL')
       and (coalesce(qual, '') ~ '\m(can_[a-z_]+|is_[a-z_]+|has_team_role|member_has_stage_access|team_id_for_project)\('
            or replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') ~ 'auth\.uid\(\)')
  loop
    raise exception 'FAIL 1: "%" on % asks for every row it reads (%): ask once, like team_id in (select my_team_ids()) (0109 shows how)', r.policyname, r.tablename, r.qual;
  end loop;

  for r in
    select c.conrelid::regclass as tbl, array_to_string(array(select a.attname from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k), ',') as cols
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f' and n.nspname = 'public'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
            and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey
       )
  loop
    raise exception 'FAIL 1: %.% points at another table without an index (deleting there reads all of %)', r.tbl, r.cols, r.tbl;
  end loop;
end $$;

-- People: Mae (Master of Team R), Ned (editor), Pia (Scheduler), Ola (editor given revenue access).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000109a01', 'mae.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a02', 'ned.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a03', 'pia.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a04', 'ola.q@mail109.example')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-000000109a01', 'mae.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a02', 'ned.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a03', 'pia.q@mail109.example'),
  ('00000000-0000-4000-8000-000000109a04', 'ola.q@mail109.example')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-000000109a01', 'Team R', 'reads-r', '00000000-0000-4000-8000-000000109a01') on conflict do nothing;
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('30000000-0000-4000-8000-000000109a02', '10000000-0000-4000-8000-000000109a01', '00000000-0000-4000-8000-000000109a02', 'ned.q@mail109.example', 'active'),
  ('30000000-0000-4000-8000-000000109a03', '10000000-0000-4000-8000-000000109a01', '00000000-0000-4000-8000-000000109a03', 'pia.q@mail109.example', 'active'),
  ('30000000-0000-4000-8000-000000109a04', '10000000-0000-4000-8000-000000109a01', '00000000-0000-4000-8000-000000109a04', 'ola.q@mail109.example', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values
  ('30000000-0000-4000-8000-000000109a02', 'editor'),
  ('30000000-0000-4000-8000-000000109a03', 'publisher'),
  ('30000000-0000-4000-8000-000000109a04', 'editor')
on conflict do nothing;
insert into revenue_access (team_id, user_id) values ('10000000-0000-4000-8000-000000109a01', '00000000-0000-4000-8000-000000109a04') on conflict do nothing;
insert into analytics_revenue_daily (team_id, platform, day, content, revenue)
select '10000000-0000-4000-8000-000000109a01', 'youtube', d::date, 'all', 10
  from generate_series(current_date - 99, current_date, interval '1 day') d
on conflict do nothing;
insert into revenue_entries (team_id, day, source, amount) values ('10000000-0000-4000-8000-000000109a01', current_date, 'sponsorship', 500);
-- (money is worked out from the metric: revenue and RPM are money.)
insert into projections (id, team_id, title, metric, target, start_day, deadline)
values ('40000000-0000-4000-8000-000000109a01', '10000000-0000-4000-8000-000000109a01', 'Revenue goal', 'revenue', 10000, current_date, current_date + 90),
       ('40000000-0000-4000-8000-000000109a02', '10000000-0000-4000-8000-000000109a01', 'Views goal', 'views', 1000000, current_date, current_date + 90)
on conflict do nothing;
insert into projection_points (projection_id, day, team_id, value) values
  ('40000000-0000-4000-8000-000000109a01', current_date, '10000000-0000-4000-8000-000000109a01', 100),
  ('40000000-0000-4000-8000-000000109a02', current_date, '10000000-0000-4000-8000-000000109a01', 1000)
on conflict do nothing;
insert into social_audit_log (team_id, platform, action) values ('10000000-0000-4000-8000-000000109a01', 'youtube', 'connected');
insert into daily_word_plays (user_id, day, puzzle) values
  ('00000000-0000-4000-8000-000000109a02', current_date, 1),
  ('00000000-0000-4000-8000-000000109a03', current_date, 1)
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 2. Same answers as before: [days of revenue, other income, money projections, their points, social history rows, own words].
create temp table seen (who text, days int, income int, money int, points int, social int, words int);
grant select, insert on seen to authenticated;
do $$
declare
  p record;
begin
  for p in select * from (values ('mae', '00000000-0000-4000-8000-000000109a01'::uuid), ('ned', '00000000-0000-4000-8000-000000109a02'::uuid),
                                  ('pia', '00000000-0000-4000-8000-000000109a03'::uuid), ('ola', '00000000-0000-4000-8000-000000109a04'::uuid)) v(who, id) loop
    perform set_config('request.jwt.claim.sub', p.id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    insert into seen values (
      p.who,
      (select count(*) from analytics_revenue_daily where team_id = '10000000-0000-4000-8000-000000109a01'),
      (select count(*) from revenue_entries where team_id = '10000000-0000-4000-8000-000000109a01'),
      (select count(*) from projections where team_id = '10000000-0000-4000-8000-000000109a01' and money),
      (select count(*) from projection_points where team_id = '10000000-0000-4000-8000-000000109a01'),
      (select count(*) from social_audit_log where team_id = '10000000-0000-4000-8000-000000109a01'),
      (select count(*) from daily_word_plays where user_id::text like '00000000-0000-4000-8000-000000109a0%'));
    reset role;
  end loop;
end $$;
do $$
declare
  r record;
  want int[];
begin
  for r in select * from seen loop
    want := case r.who
              when 'mae' then array[100, 1, 1, 2, 1, 0]
              when 'ned' then array[0, 0, 0, 1, 0, 1]
              when 'pia' then array[0, 0, 0, 1, 1, 1]
              when 'ola' then array[100, 1, 1, 2, 0, 0]
            end;
    if array[r.days, r.income, r.money, r.points, r.social, r.words] is distinct from want then
      raise exception 'FAIL 2: % sees % days of revenue, % other income, % money projections, % points, % history rows, % words (want %)', r.who, r.days, r.income, r.money, r.points, r.social, r.words, want;
    end if;
  end loop;
  if (select count(*) from seen) <> 4 then raise exception 'FAIL 2: not everyone was asked'; end if;
end $$;

select 'reads-once checks passed' as ok;
