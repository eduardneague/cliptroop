-- ============================================================================
-- 0042: posting health (so nothing about posting is ever a mystery)
--
--   * posting_runs: every time the app processes posts (from the timer or
--     "Run due posts now"): when, how many, how long, any error.
--   * posting_health(team): one call that checks the whole chain:
--       1. Are the Vault secrets there?
--       2. Is the Supabase timer running (pg_cron's own log)?
--       3. What did the app answer to the timer's last calls (pg_net's log)?
--       4. When did the app last actually process posts?
--     Masters and schedulers only.
-- Staging first, then production.
-- ============================================================================

create table if not exists posting_runs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('timer', 'manual')),
  claimed int not null default 0,
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists posting_runs_created_idx on posting_runs (created_at desc);
alter table posting_runs enable row level security;
revoke all on posting_runs from anon, authenticated;

create or replace function posting_health(p_team uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  r record;
begin
  if not (is_team_master(p_team) or has_team_role(p_team, 'publisher')) then
    raise exception 'Only the master or a scheduler can see posting health.' using errcode = '42501';
  end if;

  -- 1. Vault secrets (names only, never values).
  begin
    v := v || jsonb_build_object(
      'has_url', exists (select 1 from vault.secrets where name = 'posting_url'),
      'has_secret', exists (select 1 from vault.secrets where name = 'cron_secret'));
  exception when others then
    v := v || jsonb_build_object('has_url', null, 'has_secret', null);
  end;

  -- 2. The timer (pg_cron's own log).
  begin
    select d.start_time, d.status, left(d.return_message, 300) as message
      into r
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname = 'vplanner-posting'
     order by d.start_time desc limit 1;
    v := v || jsonb_build_object(
      'cron_scheduled', exists (select 1 from cron.job where jobname = 'vplanner-posting'),
      'cron_last', case when r is null then null else jsonb_build_object('at', r.start_time, 'status', r.status, 'message', r.message) end);
  exception when others then
    v := v || jsonb_build_object('cron_scheduled', null, 'cron_last', null);
  end;

  -- 3. What the app answered (pg_net's log of recent calls).
  begin
    v := v || jsonb_build_object('calls', coalesce((
      select jsonb_agg(jsonb_build_object('at', created, 'status', status_code, 'error', error_msg, 'body', left(content::text, 300)) order by created desc)
        from (select * from net._http_response order by created desc limit 5) x), '[]'::jsonb));
  exception when others then
    v := v || jsonb_build_object('calls', null);
  end;

  -- 4. When the app last processed posts.
  v := v || jsonb_build_object('runs', coalesce((
    select jsonb_agg(jsonb_build_object('at', created_at, 'source', source, 'claimed', claimed, 'ms', duration_ms, 'error', error) order by created_at desc)
      from (select * from posting_runs order by created_at desc limit 5) x), '[]'::jsonb));

  return v;
end;
$$;
grant execute on function posting_health(uuid) to authenticated;
