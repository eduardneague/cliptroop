-- ============================================================================
-- 0078: objectives (1.14.0)
--
--   The team's goals. Masters set them in Team → Objectives; everyone sees
--   them on the Objectives page and the dashboard widget, live.
--
--   * objectives: what to count (`metric`, e.g. shorts_posted, views) and
--     how (`filters`: which platforms, only those platforms, short or long
--     types, one person's work…), how often (a day, week, month, quarter or
--     year), the usual target, a name, a colour and a place in the list.
--     The app knows the metrics (modules/objectives/lib/metrics.ts); the
--     database only checks their shape, so new kinds need no migration.
--     Changing what an objective counts (metric, filters, period) clears its
--     recorded wins; changing its period also clears its per-period targets.
--   * objective_targets: a different target for one period ("8 this week
--     instead of 14"; 0 = off that period). Masters write, everyone reads.
--   * objective_periods: progress per objective and period, written only by
--     the server (objective_record): the latest count and when it was
--     reached. A win is claimed once per period (again only if the target
--     was raised past the last win), so the team is congratulated once.
--     celebrated_at = when the team was told; wins recorded quietly (a goal
--     that was already reached when a master set or changed it) keep it null.
--   * objective_sync: when the server last counted a team, so page loads
--     don't recount more often than every 30 seconds.
--   Realtime on objectives, objective_targets and objective_periods: the
--   widget and the page update live and everyone looking sees the confetti.
-- Staging first, then production. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- objectives
-- ---------------------------------------------------------------------------

create table if not exists objectives (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  metric text not null,
  period text not null default 'week',
  target integer not null,
  filters jsonb not null default '{}'::jsonb,
  color text not null default 'blue',
  position double precision not null default 0,
  paused_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint objectives_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint objectives_metric_check check (metric ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint objectives_period_check check (period in ('day', 'week', 'month', 'quarter', 'year')),
  constraint objectives_target_check check (target between 1 and 1000000000),
  constraint objectives_filters_check check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 2000),
  constraint objectives_color_check check (color ~ '^[a-z]{2,16}$')
);
create index if not exists objectives_team_idx on objectives (team_id, position);
create index if not exists objectives_created_by_idx on objectives (created_by);

-- Server fields stay honest: who made it and when, and it never moves team.
create or replace function objectives_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from objectives where team_id = new.team_id) >= 50 then
      raise exception 'A team can have up to 50 objectives.' using errcode = '23514';
    end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.team_id := old.team_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists objectives_write on objectives;
create trigger objectives_write before insert or update on objectives
  for each row execute procedure objectives_write();

alter table objectives enable row level security;
revoke all on objectives from anon;
revoke insert, update on objectives from authenticated;
grant select, delete on objectives to authenticated;
grant insert (id, team_id, title, metric, period, target, filters, color, position, paused_at) on objectives to authenticated;
grant update (title, metric, period, target, filters, color, position, paused_at) on objectives to authenticated;

drop policy if exists "teammates see objectives" on objectives;
create policy "teammates see objectives" on objectives for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "masters add objectives" on objectives;
create policy "masters add objectives" on objectives for insert to authenticated
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters change objectives" on objectives;
create policy "masters change objectives" on objectives for update to authenticated
  using (team_id in (select my_master_team_ids()))
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters remove objectives" on objectives;
create policy "masters remove objectives" on objectives for delete to authenticated
  using (team_id in (select my_master_team_ids()));


-- ---------------------------------------------------------------------------
-- objective_targets: a different target for one period
-- ---------------------------------------------------------------------------

create table if not exists objective_targets (
  objective_id uuid not null references objectives(id) on delete cascade,
  period_start date not null,
  team_id uuid not null references teams(id) on delete cascade,
  target integer not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (objective_id, period_start),
  constraint objective_targets_target_check check (target between 0 and 1000000000)
);
create index if not exists objective_targets_team_idx on objective_targets (team_id);
create index if not exists objective_targets_updated_by_idx on objective_targets (updated_by);

-- The team comes from the objective (never from the browser), and the date
-- must be where one of its periods starts (a Monday for weekly goals, the
-- 1st for monthly ones, …).
create or replace function objective_targets_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
  v_period text;
  d date := new.period_start;
begin
  select team_id, period into v_team, v_period from objectives where id = new.objective_id;
  if v_team is null then
    raise exception 'Objective not found.' using errcode = 'P0002';
  end if;
  if tg_op = 'UPDATE' and (new.objective_id <> old.objective_id or new.period_start <> old.period_start) then
    raise exception 'Change the target, not the period.' using errcode = '23514';
  end if;
  if not (
    v_period = 'day'
    or (v_period = 'week' and extract(isodow from d) = 1)
    or (v_period = 'month' and extract(day from d) = 1)
    or (v_period = 'quarter' and extract(day from d) = 1 and extract(month from d) in (1, 4, 7, 10))
    or (v_period = 'year' and extract(day from d) = 1 and extract(month from d) = 1)
  ) then
    raise exception 'That date isn''t the start of one of this objective''s periods.' using errcode = '23514';
  end if;
  new.team_id := v_team;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists objective_targets_write on objective_targets;
create trigger objective_targets_write before insert or update on objective_targets
  for each row execute procedure objective_targets_write();

alter table objective_targets enable row level security;
revoke all on objective_targets from anon;
revoke insert, update on objective_targets from authenticated;
grant select, delete on objective_targets to authenticated;
grant insert (objective_id, period_start, team_id, target) on objective_targets to authenticated;
grant update (target) on objective_targets to authenticated;

drop policy if exists "teammates see objective targets" on objective_targets;
create policy "teammates see objective targets" on objective_targets for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "masters add objective targets" on objective_targets;
create policy "masters add objective targets" on objective_targets for insert to authenticated
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters change objective targets" on objective_targets;
create policy "masters change objective targets" on objective_targets for update to authenticated
  using (team_id in (select my_master_team_ids()))
  with check (team_id in (select my_master_team_ids()));
drop policy if exists "masters remove objective targets" on objective_targets;
create policy "masters remove objective targets" on objective_targets for delete to authenticated
  using (team_id in (select my_master_team_ids()));


-- ---------------------------------------------------------------------------
-- objective_periods: progress and wins (server only)
-- ---------------------------------------------------------------------------

create table if not exists objective_periods (
  objective_id uuid not null references objectives(id) on delete cascade,
  period_start date not null,
  team_id uuid not null references teams(id) on delete cascade,
  period_end date not null,
  target integer not null,
  value numeric(16, 2) not null default 0,
  reached_at timestamptz,
  reached_target integer,
  winner jsonb,
  celebrated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (objective_id, period_start),
  constraint objective_periods_winner_check check (winner is null or (jsonb_typeof(winner) = 'object' and octet_length(winner::text) <= 2000))
);
create index if not exists objective_periods_team_idx on objective_periods (team_id, period_start desc);
create index if not exists objective_periods_celebrated_idx on objective_periods (team_id, celebrated_at desc) where celebrated_at is not null;

alter table objective_periods enable row level security;
revoke all on objective_periods from anon, authenticated;
grant select on objective_periods to authenticated;
drop policy if exists "teammates see objective progress" on objective_periods;
create policy "teammates see objective progress" on objective_periods for select to authenticated
  using (team_id in (select my_team_ids()));

-- Changing what an objective counts starts its record over.
create or replace function objectives_redefined()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.metric is distinct from old.metric or new.filters is distinct from old.filters or new.period is distinct from old.period then
    delete from objective_periods where objective_id = new.id;
  end if;
  if new.period is distinct from old.period then
    delete from objective_targets where objective_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists objectives_redefined on objectives;
create trigger objectives_redefined after update on objectives
  for each row execute procedure objectives_redefined();


-- ---------------------------------------------------------------------------
-- objective_sync: when the server last counted a team
-- ---------------------------------------------------------------------------

create table if not exists objective_sync (
  team_id uuid primary key references teams(id) on delete cascade,
  synced_at timestamptz not null default now()
);
alter table objective_sync enable row level security;
revoke all on objective_sync from anon, authenticated;

-- True for the one caller that may count this team now (none had in the
-- last p_seconds), false for everyone else.
create or replace function objective_claim_sync(p_team uuid, p_seconds int default 30)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v boolean;
begin
  insert into objective_sync as s (team_id, synced_at) values (p_team, now())
  on conflict (team_id) do update set synced_at = now()
    where s.synced_at < now() - make_interval(secs => greatest(0, coalesce(p_seconds, 30)))
  returning true into v;
  return coalesce(v, false);
end;
$$;
revoke all on function objective_claim_sync(uuid, int) from public, anon, authenticated;
grant execute on function objective_claim_sync(uuid, int) to service_role;

-- Saves the server's count for each objective and period (only when it
-- changed, so realtime only fires for real progress) and claims the win when
-- the count reaches the target. Returns the periods just reached that the
-- team should be told about (not the quiet ones).
--   p_rows: [{objective_id, period_start, period_end, target, value,
--             reached_at?, winner?, quiet?}]
create or replace function objective_record(p_rows jsonb)
returns setof objective_periods
language plpgsql
security definer set search_path = public
as $$
declare
  r jsonb;
  v_row objective_periods;
  v_obj uuid;
  v_start date;
  v_quiet boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'objective_record takes a list.' using errcode = '22023';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_obj := (r->>'objective_id')::uuid;
    v_start := (r->>'period_start')::date;
    v_quiet := coalesce((r->>'quiet')::boolean, false);

    insert into objective_periods as p (objective_id, period_start, team_id, period_end, target, value, updated_at)
    select o.id, v_start, o.team_id, (r->>'period_end')::date,
           greatest(0, least(1000000000, coalesce((r->>'target')::int, 0))),
           greatest(0, coalesce((r->>'value')::numeric, 0)), now()
      from objectives o
     where o.id = v_obj
    on conflict (objective_id, period_start) do update
      set period_end = excluded.period_end, target = excluded.target, value = excluded.value, updated_at = now()
      where p.period_end is distinct from excluded.period_end
         or p.target is distinct from excluded.target
         or p.value is distinct from excluded.value;

    update objective_periods p
       set reached_at = coalesce(nullif(r->>'reached_at', '')::timestamptz, now()),
           reached_target = p.target,
           winner = case when jsonb_typeof(r->'winner') = 'object' and octet_length((r->'winner')::text) <= 2000 then r->'winner' else null end,
           celebrated_at = case when v_quiet then p.celebrated_at else now() end,
           updated_at = now()
     where p.objective_id = v_obj
       and p.period_start = v_start
       and p.target > 0
       and p.value >= p.target
       and (p.reached_at is null or p.reached_target is null or p.reached_target < p.target)
    returning * into v_row;
    if found and not v_quiet then
      return next v_row;
    end if;
  end loop;
end;
$$;
revoke all on function objective_record(jsonb) from public, anon, authenticated;
grant execute on function objective_record(jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- Realtime: the widget, the page and the celebrations update live
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table objectives;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table objective_targets;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table objective_periods;
  exception when others then null;
  end;
end $$;
