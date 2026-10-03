-- ============================================================================
-- 0064: database performance, round two
--
-- Like 0023, nothing here changes WHO can see or do what. It only makes the
-- same rules and lookups cheaper, now for everything added since 0023
-- (shorts, scripts, meetings, analytics, posting, tasks …).
--
-- 1. INDEXES on every foreign key that doesn't have one yet. Postgres
--    doesn't index foreign keys by itself, so "all of this short's notes",
--    or deleting a team (which has to find every row that points at it),
--    meant reading whole tables. Found automatically, so none is missed.
--
-- 2. FASTER RULES (row-level security). Rules that said
--      auth.uid()               → asked again for every row
--      is_team_member(team_id)  → one membership lookup per row
--      is_team_master(team_id)  → the same, for masters
--    now say (select auth.uid()) / team_id in (select my_team_ids()) /
--    team_id in (select my_master_team_ids()): asked ONCE per query, then
--    each row is just checked against the answer. Same rule, word for word
--    the same meaning (the helpers come from 0023). A list of 300 shorts
--    goes from 300 lookups to one.
--
-- Safe to run more than once (the second run finds nothing left to do).
-- Staging first, then production.
-- ============================================================================


-- 1. Index every unindexed foreign key ----------------------------------------
do $$
declare
  r record;
  v_name text;
  v_n int := 0;
begin
  for r in
    select c.conrelid,
           cl.relname,
           array_agg(a.attname::text order by k.ord) as cols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and n.nspname = 'public'
       and cl.relkind = 'r'
       -- Already covered: an ordinary (not partial) index that starts with
       -- exactly these columns, in any order.
       and not exists (
         select 1
           from pg_index i
          where i.indrelid = c.conrelid
            and i.indpred is null
            and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
            and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey
       )
     group by c.oid, c.conrelid, cl.relname
  loop
    v_name := left(r.relname || '_' || array_to_string(r.cols, '_'), 54) || '_fkey_idx';
    -- A name already taken by something else (another table's index, say).
    if exists (
      select 1 from pg_class pc
       where pc.relname = v_name and pc.relnamespace = 'public'::regnamespace
         and not exists (select 1 from pg_index pi where pi.indexrelid = pc.oid and pi.indrelid = r.conrelid)
    ) then
      v_name := left(r.relname || '_' || array_to_string(r.cols, '_'), 49) || '_' || substr(md5(r.conrelid::text || array_to_string(r.cols, ',')), 1, 4) || '_fkey_idx';
    end if;
    execute format(
      'create index if not exists %I on public.%I (%s)',
      v_name,
      r.relname,
      (select string_agg(quote_ident(x), ', ') from unnest(r.cols) as x)
    );
    v_n := v_n + 1;
  end loop;
  raise notice '0064: indexed % foreign key(s).', v_n;
end;
$$;


-- 2. Ask once per query, not once per row --------------------------------------
create or replace function pg_temp.vp_once_per_query(e text)
returns text
language plpgsql
immutable
as $f$
declare
  v text := e;
begin
  if v is null then
    return null;
  end if;

  -- auth.uid() → (select auth.uid()), leaving ones already written that way.
  v := replace(v, '( SELECT auth.uid() AS uid)', '§UID§');
  v := regexp_replace(v, '(?<![A-Za-z0-9_.])auth\.uid\(\)', '§UID§', 'g');
  v := replace(v, '§UID§', '( SELECT auth.uid() AS uid)');

  -- is_team_member(col) / is_team_master(col) → col in (select my_…()).
  -- Only for a plain column, and never under NOT (where "unknown" and
  -- "false" would differ for an empty column).
  if v !~* 'not\s*\(?\s*is_team_(member|master)\(' then
    v := regexp_replace(v, '(?<![A-Za-z0-9_.])is_team_member\(([a-z_][a-z0-9_]*)\)', '(\1 IN ( SELECT my_team_ids() AS my_team_ids))', 'g');
    v := regexp_replace(v, '(?<![A-Za-z0-9_.])is_team_master\(([a-z_][a-z0-9_]*)\)', '(\1 IN ( SELECT my_master_team_ids() AS my_master_team_ids))', 'g');
  end if;
  return v;
end;
$f$;

do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
  loop
    v_qual := pg_temp.vp_once_per_query(p.qual);
    v_check := pg_temp.vp_once_per_query(p.with_check);
    if v_qual is distinct from p.qual or v_check is distinct from p.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        p.policyname,
        p.schemaname,
        p.tablename,
        case when v_qual is distinct from p.qual then format(' using (%s)', v_qual) else '' end,
        case when v_check is distinct from p.with_check then format(' with check (%s)', v_check) else '' end
      );
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '0064: % rule(s) now ask once per query.', v_n;
end;
$$;

drop function if exists pg_temp.vp_once_per_query(text);


-- A few lookups the app makes on every page ---------------------------------
-- My tasks (the dashboard widget and the contribution grid).
create index if not exists tasks_user_state_idx on tasks (user_id, state);
-- The bell's unread count is covered by 0023; app errors by last_seen for /status.
create index if not exists app_errors_last_seen_idx on app_errors (last_seen desc);

-- Fresh statistics so the planner uses all of this straight away.
analyze;
