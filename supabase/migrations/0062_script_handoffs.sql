-- ============================================================================
-- 0062: script hand-offs (Script → Review → Staging) + revenue currency
--
--   * profiles.currency: the currency Analytics → Revenue is shown in, per
--     person (any ISO 4217 code; the app converts with exchange rates).
--   * scripts.step: the three default documents are steps: 'write' (Script),
--     'review' (Review), 'staging' (Staging). New videos get it when the
--     documents are created; existing videos are filled in here by name
--     (the first one of each). Once set, a step never changes.
--   * team_script_people: the team's default people for Review and Staging
--     (Team → Defaults → Scripts). Masters set them.
--   * script_doc_people: who reviews / stages THIS video (on its Review or
--     Staging document). When a document has nobody of its own, the team's
--     defaults apply. Masters, schedulers and the video's scripters set them.
--   * Those people can edit their document (and its images), like scripters.
--   * script_handoffs: the log of "Ready for review" / "Ready for staging".
--   * script_hand_off(script, copy): checks who's asking, copies the text
--     into the next document when it's still empty, logs it, and returns
--     who to notify (the app sends the notifications).
--
-- Staging first, then production.
-- ============================================================================

-- Revenue currency ------------------------------------------------------------
alter table profiles add column if not exists currency text;
alter table profiles drop constraint if exists profiles_currency_check;
alter table profiles add constraint profiles_currency_check check (currency is null or currency ~ '^[A-Z]{3}$');
grant update (currency) on profiles to authenticated;

-- Steps -----------------------------------------------------------------------
alter table scripts add column if not exists step text;
alter table scripts drop constraint if exists scripts_step_check;
alter table scripts add constraint scripts_step_check check (step is null or (kind = 'script' and step in ('write', 'review', 'staging')));

-- Existing videos: the default documents, by name. The edit trigger is paused
-- so this doesn't count as an edit (no new version, "last edited" unchanged).
alter table scripts disable trigger scripts_before_write;
with ranked as (
  select id,
         coalesce(short_video_id, long_video_id) as video,
         case name when 'Script' then 'write' when 'Review' then 'review' when 'Staging' then 'staging' end as st,
         row_number() over (partition by coalesce(short_video_id, long_video_id), name order by position, created_at) as n
    from scripts
   where kind = 'script' and step is null and name in ('Script', 'Review', 'Staging')
)
update scripts s
   set step = r.st
  from ranked r
 where s.id = r.id
   and r.n = 1
   and not exists (select 1 from scripts x where coalesce(x.short_video_id, x.long_video_id) = r.video and x.step = r.st);
alter table scripts enable trigger scripts_before_write;

create unique index if not exists scripts_one_step_per_video on scripts (coalesce(short_video_id, long_video_id), step) where step is not null;

-- Kind and step never change once set.
create or replace function scripts_kind_fixed()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A document''s kind can''t be changed.' using errcode = '42501';
  end if;
  if old.step is not null and new.step is distinct from old.step then
    raise exception 'A document''s step can''t be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- New videos: the default documents carry their step.
create or replace function ensure_script_docs(p_short uuid, p_long uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
  v_scripts int;
  v_names text[];
  v_can_script boolean;
  v_can_research boolean;
begin
  if num_nonnulls(p_short, p_long) <> 1 then
    raise exception 'Pass a short or a long video.' using errcode = '22023';
  end if;
  v_team := coalesce(
    (select team_id from short_videos where id = p_short),
    (select team_id from long_video_projects where id = p_long)
  );
  if v_team is null or v_team not in (select my_team_ids()) then
    raise exception 'Video not found.' using errcode = 'P0002';
  end if;

  -- One at a time per video.
  perform pg_advisory_xact_lock(hashtext('script-docs:' || coalesce(p_short, p_long)::text));

  v_can_script := can_edit_doc(v_team, p_short, p_long, 'script');
  v_can_research := p_long is not null and can_edit_doc(v_team, null, p_long, 'research');

  select count(*), coalesce(array_agg(name), '{}') into v_scripts, v_names
    from scripts
   where kind = 'script' and (short_video_id = p_short or long_video_id = p_long);

  -- Defaults the first time (a lone existing script becomes "Script").
  if v_can_script and v_scripts <= 1 then
    if v_scripts = 0 then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position, step) values (v_team, p_short, p_long, 'script', 'Script', 1, 'write');
    end if;
    if not ('Review' = any (v_names)) then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position, step) values (v_team, p_short, p_long, 'script', 'Review', 2, 'review');
    end if;
    if not ('Staging' = any (v_names)) then
      insert into scripts (team_id, short_video_id, long_video_id, kind, name, position, step) values (v_team, p_short, p_long, 'script', 'Staging', 3, 'staging');
    end if;
  end if;

  if v_can_research and not exists (select 1 from scripts where kind = 'research' and long_video_id = p_long) then
    insert into scripts (team_id, long_video_id, kind, name, position) values (v_team, p_long, 'research', 'Research', 1);
  end if;
end;
$$;
grant execute on function ensure_script_docs(uuid, uuid) to authenticated;

-- People ----------------------------------------------------------------------
create table if not exists team_script_people (
  team_id uuid not null references teams(id) on delete cascade,
  step text not null check (step in ('review', 'staging')),
  team_member_id uuid not null references team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, step, team_member_id)
);
create index if not exists team_script_people_member_idx on team_script_people (team_member_id);
alter table team_script_people enable row level security;
drop policy if exists "team reads script defaults" on team_script_people;
create policy "team reads script defaults" on team_script_people for select to authenticated
  using (team_id in (select my_team_ids()));

create table if not exists script_doc_people (
  script_id uuid not null references scripts(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (script_id, team_member_id)
);
create index if not exists script_doc_people_member_idx on script_doc_people (team_member_id);
create index if not exists script_doc_people_team_idx on script_doc_people (team_id);
create index if not exists script_doc_people_added_by_idx on script_doc_people (added_by);
alter table script_doc_people enable row level security;
drop policy if exists "team reads script people" on script_doc_people;
create policy "team reads script people" on script_doc_people for select to authenticated
  using (team_id in (select my_team_ids()));
-- No insert/update/delete policies: changes go through set_script_people().

-- The people on a Review / Staging document: its own, else the team's defaults (active members only).
create or replace function script_step_member_ids(p_script uuid)
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  with d as (
    select id, team_id, step from scripts where id = p_script and step in ('review', 'staging')
  ),
  own as (
    select p.team_member_id from script_doc_people p join d on d.id = p.script_id
  )
  select m.id
    from team_members m
    join d on d.team_id = m.team_id
   where m.status = 'active'
     and (
       m.id in (select team_member_id from own)
       or (
         not exists (select 1 from own)
         and m.id in (select t.team_member_id from team_script_people t where t.team_id = d.team_id and t.step = d.step)
       )
     );
$$;

create or replace function is_script_step_person(p_script uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
      from script_step_member_ids(p_script) as x(member_id)
      join team_members m on m.id = x.member_id
     where m.user_id = auth.uid()
  );
$$;

-- Reviewers edit the Review document, staging people the Staging one (and upload their images).
create or replace function can_edit_script_id(p_script uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select can_edit_doc(team_id, short_video_id, long_video_id, kind) from scripts where id = p_script), false)
      or is_script_step_person(p_script);
$$;

drop policy if exists "writers edit scripts" on scripts;
create policy "writers edit scripts" on scripts for update to authenticated
  using (can_edit_doc(team_id, short_video_id, long_video_id, kind) or is_script_step_person(id))
  with check (can_edit_doc(team_id, short_video_id, long_video_id, kind) or is_script_step_person(id));

/*
 * Set who reviews / stages.
 *   p_script given: this video's Review or Staging document (masters,
 *     schedulers and the video's scripters). An empty list = use the team's.
 *   p_script null: the team's defaults for p_step (masters).
 */
create or replace function set_script_people(p_script uuid, p_team uuid, p_step text, p_members uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  d scripts%rowtype;
  v_team uuid;
begin
  p_members := coalesce(p_members, '{}');
  if p_script is not null then
    select * into d from scripts where id = p_script;
    if d.id is null or d.team_id not in (select my_team_ids()) then
      raise exception 'Document not found.' using errcode = 'P0002';
    end if;
    if d.step not in ('review', 'staging') or d.step is null then
      raise exception 'Only the Review and Staging documents have their own people.' using errcode = '22023';
    end if;
    if not (is_team_master(d.team_id) or has_team_role(d.team_id, 'publisher') or can_edit_doc(d.team_id, d.short_video_id, d.long_video_id, 'script')) then
      raise exception 'Only a master, a scheduler or this video''s scripters can choose who reviews and stages.' using errcode = '42501';
    end if;
    v_team := d.team_id;
  else
    if p_step not in ('review', 'staging') or p_step is null or p_team is null then
      raise exception 'Pick Review or Staging.' using errcode = '22023';
    end if;
    if not is_team_master(p_team) then
      raise exception 'Only masters set the team''s defaults.' using errcode = '42501';
    end if;
    v_team := p_team;
  end if;
  if exists (
    select 1 from unnest(p_members) as x(id)
     where not exists (select 1 from team_members m where m.id = x.id and m.team_id = v_team and m.status = 'active')
  ) then
    raise exception 'Everyone must be on the team.' using errcode = '22023';
  end if;

  if p_script is not null then
    delete from script_doc_people where script_id = p_script and team_member_id <> all (p_members);
    insert into script_doc_people (script_id, team_member_id, team_id, added_by)
    select p_script, x.id, v_team, auth.uid() from unnest(p_members) as x(id)
    on conflict (script_id, team_member_id) do nothing;
  else
    delete from team_script_people where team_id = v_team and step = p_step and team_member_id <> all (p_members);
    insert into team_script_people (team_id, step, team_member_id)
    select v_team, p_step, x.id from unnest(p_members) as x(id)
    on conflict (team_id, step, team_member_id) do nothing;
  end if;
end;
$$;
grant execute on function set_script_people(uuid, uuid, text, uuid[]) to authenticated;

-- Hand-offs -------------------------------------------------------------------
create table if not exists script_handoffs (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  to_script_id uuid references scripts(id) on delete set null,
  team_id uuid not null references teams(id) on delete cascade,
  from_step text not null check (from_step in ('write', 'review')),
  to_step text not null check (to_step in ('review', 'staging')),
  handed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists script_handoffs_script_idx on script_handoffs (script_id, created_at desc);
create index if not exists script_handoffs_to_idx on script_handoffs (to_script_id);
create index if not exists script_handoffs_team_idx on script_handoffs (team_id);
create index if not exists script_handoffs_by_idx on script_handoffs (handed_by);
alter table script_handoffs enable row level security;
drop policy if exists "team reads hand-offs" on script_handoffs;
create policy "team reads hand-offs" on script_handoffs for select to authenticated
  using (team_id in (select my_team_ids()));
-- Written only by script_hand_off().

create or replace function script_hand_off(p_script uuid, p_copy boolean default true)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d scripts%rowtype;
  nxt scripts%rowtype;
  v_next text;
  v_users uuid[];
  v_copied boolean := false;
begin
  select * into d from scripts where id = p_script;
  if d.id is null or d.team_id not in (select my_team_ids()) then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;
  if d.step is null or d.step not in ('write', 'review') then
    raise exception 'Only the Script and Review documents are handed on.' using errcode = '22023';
  end if;
  -- Masters; the scripters for Script; the reviewers for Review.
  if not (
    is_team_master(d.team_id)
    or (d.step = 'write' and can_edit_doc(d.team_id, d.short_video_id, d.long_video_id, 'script'))
    or (d.step = 'review' and is_script_step_person(d.id))
  ) then
    raise exception 'Only this step''s people (or a master) can hand it on.' using errcode = '42501';
  end if;

  v_next := case d.step when 'write' then 'review' else 'staging' end;
  select * into nxt
    from scripts
   where step = v_next
     and (short_video_id = d.short_video_id or long_video_id = d.long_video_id);
  if nxt.id is null then
    raise exception 'The % document is missing. Open the script once so it''s created.', initcap(v_next) using errcode = 'P0002';
  end if;
  if not exists (select 1 from script_step_member_ids(nxt.id)) then
    raise exception 'Choose who does the % first.', v_next using errcode = '22023';
  end if;

  -- An empty next document starts from this one's text.
  if p_copy
     and btrim(coalesce(nxt.content_text, '')) = ''
     and not jsonb_path_exists(nxt.content, '$.** ? (@.type == "image")') then
    update scripts set content = d.content, content_text = d.content_text, word_count = d.word_count where id = nxt.id;
    v_copied := true;
  end if;

  insert into script_handoffs (script_id, to_script_id, team_id, from_step, to_step, handed_by)
  values (d.id, nxt.id, d.team_id, d.step, v_next, auth.uid());

  select coalesce(array_agg(distinct m.user_id), '{}') into v_users
    from script_step_member_ids(nxt.id) as x(member_id)
    join team_members m on m.id = x.member_id
   where m.user_id is distinct from auth.uid();

  return jsonb_build_object(
    'next_id', nxt.id,
    'next_name', nxt.name,
    'next_step', v_next,
    'name', d.name,
    'copied', v_copied,
    'team', d.team_id,
    'short', d.short_video_id,
    'long', d.long_video_id,
    'recipients', to_jsonb(v_users)
  );
end;
$$;
grant execute on function script_hand_off(uuid, boolean) to authenticated;
