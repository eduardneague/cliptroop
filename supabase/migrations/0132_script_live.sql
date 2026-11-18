-- ============================================================================
-- 0132: who's in a script, and their cursors (1.53.5)
--
-- The owner (Nov 18 2026): "if theres any way to add the cursor thing without
-- adding strain on aynthing, we shoiuld do it". Who's in a script and where
-- their cursor is go from browser to browser over Supabase Realtime (presence
-- and broadcast on the private channel "script:<script id>"), never through
-- the app's server or a table. Realtime reads these two rules once, when
-- someone opens a script, and keeps the answer while they're connected:
--
--   * receive (select): the others' cursors and who's here
--   * send (insert):    your cursor, that you're here, that you saved
--
-- Only the script's team, the people who can read the script (0034). The
-- app's other live updates are on public channels (each table's own rules
-- guard what they send) and don't change.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

-- "script:<id>" for a script of one of your teams. Security definer: it reads
-- the script whatever its rules, and asks your teams itself (my_team_ids).
create or replace function public.script_live_allowed(p_topic text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_topic ~ '^script:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from scripts s
      where s.id = substr(p_topic, 8)::uuid
        and s.team_id in (select my_team_ids())
    );
$$;
revoke all on function public.script_live_allowed(text) from public;
grant execute on function public.script_live_allowed(text) to authenticated;

-- The rules themselves (Realtime's own table; a database without Realtime,
-- like CI's without its stand-in, skips them).
do $do$
begin
  if to_regclass('realtime.messages') is null then
    raise notice '0132: no realtime.messages here: the live rules are skipped';
    return;
  end if;

  execute 'drop policy if exists "script live: teammates receive" on realtime.messages';
  execute $p$
    create policy "script live: teammates receive" on realtime.messages
      for select to authenticated
      using (realtime.messages.extension in ('broadcast', 'presence') and (select public.script_live_allowed(realtime.topic())))
  $p$;

  execute 'drop policy if exists "script live: teammates send" on realtime.messages';
  execute $p$
    create policy "script live: teammates send" on realtime.messages
      for insert to authenticated
      with check (realtime.messages.extension in ('broadcast', 'presence') and (select public.script_live_allowed(realtime.topic())))
  $p$;
end;
$do$;

-- For App setup: are the rules in place? (Read with the service key.)
create or replace function public.script_live_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname in ('script live: teammates receive', 'script live: teammates send')
    having count(*) = 2
  );
$$;
revoke all on function public.script_live_ready() from public;
grant execute on function public.script_live_ready() to service_role;
