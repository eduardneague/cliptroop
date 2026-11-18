-- ============================================================================
-- 0134: writing a script together, live (1.55.0)
--
-- The owner (Nov 18 2026): "we need to make it so that two or three or however
-- many people can write at once and the page reloads quickly and updates
-- automatically for everyone at the same time". Until now a script was saved
-- whole, and whoever saved second was told someone else had saved first
-- ("raduda saved · Reload" / "Someone else saved a newer version").
--
-- Now every change anyone makes is a small step (ProseMirror's own, the way
-- Google Docs-like editors share one document). The database puts everyone's
-- steps in one order: a page sends its steps with the version it made them
-- on, and they're taken only if that's still the script's version (else the
-- page first takes the steps it hadn't seen, moves its own over them, and sends
-- again). The others' pages get them at once over the script's live channel
-- (0132), or from here when they missed some.
--
--   * script_live: each script's version (how many steps so far) and which of
--     them its saved text (scripts.content) already has.
--   * script_steps: the steps, in order. The saved text plus the steps after it
--     is the script now; a page opening the script draws exactly that.
--   * script_live_push, script_live_since, script_live_snapshot: the only way in
--     (security definer, each checking who may edit or read the script).
--
-- When a script's text is replaced some other way (sent on to the next step,
-- an older page saving the whole script) its live writing starts again from
-- that text: the steps before it can't be put on top of it.
--
-- Additive and safe to run twice. Staging first, then production.
-- ============================================================================

create table if not exists public.script_live (
  script_id uuid primary key references public.scripts(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  -- Steps so far (the script's version).
  version integer not null default 0 check (version >= 0),
  -- Which of them scripts.content has.
  doc_version integer not null default 0 check (doc_version >= 0),
  updated_at timestamptz not null default now(),
  check (doc_version <= version)
);
create index if not exists script_live_team_idx on script_live (team_id);

create table if not exists public.script_steps (
  script_id uuid not null references public.scripts(id) on delete cascade,
  -- The version they were made on: they take the script from version to version + n.
  version integer not null check (version >= 0),
  n integer not null check (n between 1 and 1000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) <= 1000000),
  -- The page (one tab) that made them.
  client text not null check (client ~ '^[A-Za-z0-9_-]{6,40}$'),
  user_id uuid references auth.users(id) on delete set null,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (script_id, version)
);
create index if not exists script_steps_team_idx on script_steps (team_id);
create index if not exists script_steps_user_idx on script_steps (user_id);

alter table script_live enable row level security;
alter table script_steps enable row level security;

-- Read by the script's team (a page opening the script draws the saved text and the steps after it). Written only by
-- the functions below.
drop policy if exists "script live: teammates read" on script_live;
create policy "script live: teammates read" on script_live for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "script steps: teammates read" on script_steps;
create policy "script steps: teammates read" on script_steps for select to authenticated
  using (team_id in (select my_team_ids()));

revoke all on script_live, script_steps from anon;
revoke insert, update, delete on script_live, script_steps from authenticated;
grant select on script_live, script_steps to authenticated;

-- Two-step sign-in (0125), as on every table.
do $$
declare
  t text;
begin
  foreach t in array array['script_live', 'script_steps'] loop
    execute format('drop policy if exists "two-step sign-in" on public.%I', t);
    execute format(
      'create policy "two-step sign-in" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sending steps: taken only if they were made on the script's version now.
-- {ok: true, version} (the version after them), or {ok: false, version} (the
-- page takes the steps it hadn't seen first, then sends again).
-- ---------------------------------------------------------------------------
create or replace function public.script_live_push(p_script uuid, p_version integer, p_steps jsonb, p_client text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
  v_n integer;
  v_new integer;
  v_cur integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_steps);
  if v_n < 1 or v_n > 1000 or octet_length(p_steps::text) > 1000000 then
    raise exception 'Too much at once: try a smaller paste.' using errcode = '22023';
  end if;
  if p_version is null or p_version < 0 then
    raise exception 'Bad version.' using errcode = '22023';
  end if;
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{6,40}$' then
    raise exception 'Bad page id.' using errcode = '22023';
  end if;
  if not public.can_edit_script_id(p_script) then
    raise exception 'You can''t edit this script.' using errcode = '42501';
  end if;
  select team_id into v_team from scripts where id = p_script;

  insert into script_live (script_id, team_id) values (p_script, v_team) on conflict (script_id) do nothing;
  -- One at a time: the row is locked until this one is done, and a second page sending on the same version finds
  -- it moved on.
  update script_live set version = version + v_n, updated_at = now()
   where script_id = p_script and version = p_version
  returning version into v_new;
  if v_new is null then
    select version into v_cur from script_live where script_id = p_script;
    return jsonb_build_object('ok', false, 'version', v_cur);
  end if;
  insert into script_steps (script_id, version, n, steps, client, user_id, team_id)
  values (p_script, p_version, v_n, p_steps, p_client, auth.uid(), v_team);
  return jsonb_build_object('ok', true, 'version', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- The steps since a version (a page that missed some, or opening the script).
-- {version, doc, steps: [{v, n, c, s}]} in order, at most 500 rows (ask again
-- from the last one's end for more), or {version, doc, gone: true} when they
-- start before what's kept (the page draws the saved text again).
-- ---------------------------------------------------------------------------
create or replace function public.script_live_since(p_script uuid, p_version integer)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_live script_live%rowtype;
  v_first integer;
  v_rows jsonb;
begin
  if not exists (select 1 from scripts s where s.id = p_script and s.team_id in (select my_team_ids())) then
    raise exception 'Script not found.' using errcode = '42501';
  end if;
  select * into v_live from script_live where script_id = p_script;
  if not found then
    return jsonb_build_object('version', 0, 'doc', 0, 'steps', '[]'::jsonb);
  end if;
  if p_version is null or p_version > v_live.version then
    return jsonb_build_object('version', v_live.version, 'doc', v_live.doc_version, 'gone', true);
  end if;
  if p_version = v_live.version then
    return jsonb_build_object('version', v_live.version, 'doc', v_live.doc_version, 'steps', '[]'::jsonb);
  end if;
  select min(version) into v_first from script_steps where script_id = p_script and version >= p_version;
  if v_first is distinct from p_version then
    return jsonb_build_object('version', v_live.version, 'doc', v_live.doc_version, 'gone', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('v', x.version, 'n', x.n, 'c', x.client, 's', x.steps) order by x.version), '[]'::jsonb)
    into v_rows
    from (
      select version, n, client, steps from script_steps
       where script_id = p_script and version >= p_version
       order by version
       limit 500
    ) x;
  return jsonb_build_object('version', v_live.version, 'doc', v_live.doc_version, 'steps', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- The saved text, as it is at a version (a page with nothing left to send
-- saves it every few seconds: for lists, searches, exports, sending it on).
-- Only ever forward: an older one arriving late is left out. Steps the saved
-- text has, a day old and 2000 behind, are tidied away.
-- ---------------------------------------------------------------------------
create or replace function public.script_live_snapshot(p_script uuid, p_version integer, p_content jsonb, p_text text, p_words integer)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_edit_script_id(p_script) then
    raise exception 'You can''t edit this script.' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 2000000 then
    raise exception 'This script is too big to save. Remove some images or text.' using errcode = '22023';
  end if;
  update script_live set doc_version = p_version, updated_at = now()
   where script_id = p_script and doc_version < p_version and p_version <= version;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  perform set_config('cliptroop.live_snapshot', 'on', true);
  update scripts
     set content = p_content,
         content_text = left(coalesce(p_text, ''), 500000),
         word_count = greatest(0, least(coalesce(p_words, 0), 1000000))
   where id = p_script;
  perform set_config('cliptroop.live_snapshot', 'off', true);
  delete from script_steps
   where script_id = p_script and version + n <= p_version - 2000 and created_at < now() - interval '1 day';
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The text replaced some other way: its live writing starts again from it.
-- ---------------------------------------------------------------------------
create or replace function public.script_live_restart()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(current_setting('cliptroop.live_snapshot', true), '') = 'on' then
    return null;
  end if;
  if new.content is distinct from old.content then
    -- (Even with no live writing yet: a page that opened the old text, at version 0, must not put its steps on this.)
    insert into script_live (script_id, team_id, version, doc_version) values (new.id, new.team_id, 1, 1)
    on conflict (script_id) do update set version = script_live.version + 1, doc_version = script_live.version + 1, updated_at = now();
    delete from script_steps where script_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists script_live_restart on scripts;
create trigger script_live_restart
  after update of content on scripts
  for each row execute procedure public.script_live_restart();

revoke all on function public.script_live_push(uuid, integer, jsonb, text) from public, anon;
revoke all on function public.script_live_since(uuid, integer) from public, anon;
revoke all on function public.script_live_snapshot(uuid, integer, jsonb, text, integer) from public, anon;
revoke all on function public.script_live_restart() from public, anon, authenticated;
grant execute on function public.script_live_push(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.script_live_since(uuid, integer) to authenticated;
grant execute on function public.script_live_snapshot(uuid, integer, jsonb, text, integer) to authenticated;

-- For App setup: is it in place? (Read with the service key.)
create or replace function public.script_edits_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select to_regclass('public.script_steps') is not null
     and exists (select 1 from pg_proc where proname = 'script_live_push' and pronamespace = 'public'::regnamespace);
$$;
revoke all on function public.script_edits_ready() from public, anon, authenticated;
grant execute on function public.script_edits_ready() to service_role;

-- The API sees the new tables, their link to scripts and the functions at once.
notify pgrst, 'reload schema';
