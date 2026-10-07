-- ============================================================================
-- 0067: Status history (the hourly bars on /status and /developer)
--
--   * status_samples: one row per part of the app per check (every 10 min),
--     kept 30 days. Server only (no policies): the public page only ever
--     gets the levels, never the details.
--   * status_tick(): runs every 10 minutes (pg_cron "vplanner-status").
--     First it writes down whether the app answered the PREVIOUS call
--     ("Website and app": the app can't record itself being down), then it
--     calls the app again with {"status": true}; the app checks everything
--     and writes the rest of the samples itself.
--   * status_history(hours): the worst level per part per hour.
--   * status_incidents(days): stretches where a part wasn't working.
--   * status_current(): the latest level per part (last 30 minutes).
-- Staging first, then production.
-- ============================================================================

create table if not exists status_samples (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  component text not null check (char_length(component) between 1 and 40),
  level text not null check (level in ('ok', 'warn', 'down')),
  detail text check (char_length(detail) <= 300)
);
create index if not exists status_samples_at_idx on status_samples (at);
create index if not exists status_samples_component_at_idx on status_samples (component, at desc);
alter table status_samples enable row level security;
revoke all on status_samples from anon, authenticated;
-- No policies: only the server (service role) reads and writes it.

-- The call status_tick() made last time, so the next tick can see its answer.
create table if not exists status_state (
  id boolean primary key default true check (id),
  last_request bigint,
  last_at timestamptz
);
alter table status_state enable row level security;
revoke all on status_state from anon, authenticated;

create or replace function status_tick()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  st status_state%rowtype;
  resp record;
  v_req bigint;
begin
  select * into st from status_state where id;
  if st.last_request is not null then
    begin
      select status_code, timed_out, error_msg into resp from net._http_response where id = st.last_request;
      if not found then
        insert into status_samples (at, component, level, detail) values (st.last_at, 'app', 'down', 'Didn''t answer the status check.');
      elsif resp.status_code is null or resp.status_code >= 500 or coalesce(resp.timed_out, false) then
        insert into status_samples (at, component, level, detail)
        values (st.last_at, 'app', 'down',
                left(case when coalesce(resp.timed_out, false) then 'Timed out.'
                          when resp.status_code is null then coalesce('Not reachable: ' || resp.error_msg, 'Not reachable.')
                          else 'Answered with an error (HTTP ' || resp.status_code || ').' end, 300));
      else
        insert into status_samples (at, component, level, detail) values (st.last_at, 'app', 'ok', 'Answered (HTTP ' || resp.status_code || ').');
        -- It answered but refused the call (wrong CRON_SECRET or posting_url):
        -- automatic posting can't work either, and the app wrote nothing itself.
        if resp.status_code >= 400 then
          insert into status_samples (at, component, level, detail)
          values (st.last_at, 'timer', 'warn', 'The app refused the timer''s call (HTTP ' || resp.status_code || '): check CRON_SECRET and the posting_url secret.');
        end if;
      end if;
    exception when others then
      null; -- never let the bookkeeping stop the next check
    end;
  end if;

  delete from status_samples where at < now() - interval '30 days';

  v_req := posting_call('{"status": true}'::jsonb);
  insert into status_state (id, last_request, last_at) values (true, v_req, now())
  on conflict (id) do update set last_request = excluded.last_request, last_at = excluded.last_at;
end;
$$;
revoke all on function status_tick() from public, anon, authenticated;

-- The worst level per part per hour, newest hours included (server only).
create or replace function status_history(p_hours int default 72)
returns table (component text, hour timestamptz, level text, samples int, warn int, down int, detail text)
language sql
stable
security definer set search_path = public
as $$
  select s.component,
         date_trunc('hour', s.at) as hour,
         case when bool_or(s.level = 'down') then 'down' when bool_or(s.level = 'warn') then 'warn' else 'ok' end,
         count(*)::int,
         (count(*) filter (where s.level = 'warn'))::int,
         (count(*) filter (where s.level = 'down'))::int,
         (array_agg(s.detail order by case s.level when 'down' then 0 when 'warn' then 1 else 2 end, s.at desc))[1]
    from status_samples s
   where s.at >= date_trunc('hour', now()) - make_interval(hours => least(greatest(coalesce(p_hours, 72), 1), 720) - 1)
   group by 1, 2
   order by 1, 2;
$$;
revoke all on function status_history(int) from public, anon, authenticated;
grant execute on function status_history(int) to service_role;

-- Stretches where a part wasn't fully working (gaps over 25 minutes split them).
create or replace function status_incidents(p_days int default 7)
returns table (component text, level text, started_at timestamptz, last_bad_at timestamptz, ended_at timestamptz, samples int, detail text)
language sql
stable
security definer set search_path = public
as $$
  with s as (
    select x.component, x.at, x.level, x.detail,
           lag(x.at) over w as prev_at,
           lag(x.level) over w as prev_level,
           lead(x.at) over w as next_at
      from status_samples x
     where x.at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
    window w as (partition by x.component order by x.at)
  ), bad as (
    select s.*,
           sum(case when s.prev_level is null or s.prev_level = 'ok' or s.at - s.prev_at > interval '25 minutes' then 1 else 0 end)
             over (partition by s.component order by s.at) as grp
      from s
     where s.level <> 'ok'
  )
  select b.component,
         case when bool_or(b.level = 'down') then 'down' else 'warn' end,
         min(b.at),
         max(b.at),
         -- The next check after the last bad one (null = still going on).
         (array_agg(b.next_at order by b.at desc))[1],
         count(*)::int,
         (array_agg(b.detail order by case b.level when 'down' then 0 else 1 end, b.at desc))[1]
    from bad b
   group by b.component, b.grp
   order by min(b.at) desc
   limit 50;
$$;
revoke all on function status_incidents(int) from public, anon, authenticated;
grant execute on function status_incidents(int) to service_role;

-- The latest level per part, from the last 30 minutes (levels only).
create or replace function status_current()
returns table (component text, level text, at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select distinct on (s.component) s.component, s.level, s.at
    from status_samples s
   where s.at > now() - interval '30 minutes'
   order by s.component, s.at desc;
$$;
revoke all on function status_current() from public, anon, authenticated;
grant execute on function status_current() to service_role;

-- Every 10 minutes (scheduling the same name again just updates it).
select cron.schedule('vplanner-status', '*/10 * * * *', $$ select status_tick(); $$);
