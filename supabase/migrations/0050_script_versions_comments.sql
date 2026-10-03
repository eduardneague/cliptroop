-- ============================================================================
-- 0050: script versions, research documents and inline comments
--
--   * A video can have several documents now (scripts.kind + name + position):
--       kind 'script'   → versions (Script · Review · Staging · …), shorts + longs
--       kind 'research' → research documents, long videos only
--     Existing scripts become each video's "Script" version.
--   * Who edits:
--       script   → the video's scripters + masters (unchanged)
--       research → masters, researchers, and the video's scripters
--   * script_comments: comments anchored to quoted text (the document itself
--     is never changed by a comment). Anyone on the team comments and
--     resolves; the author or a master deletes.
-- Staging first, then production.
-- ============================================================================

alter table scripts drop constraint if exists scripts_short_video_id_key;
alter table scripts drop constraint if exists scripts_long_video_id_key;

alter table scripts
  add column if not exists kind text not null default 'script',
  add column if not exists name text not null default 'Script',
  add column if not exists position double precision not null default 1;
alter table scripts drop constraint if exists scripts_kind_check;
alter table scripts add constraint scripts_kind_check check (kind in ('script', 'research'));
alter table scripts drop constraint if exists scripts_name_check;
alter table scripts add constraint scripts_name_check check (char_length(btrim(name)) between 1 and 60);
alter table scripts drop constraint if exists scripts_research_long_only;
alter table scripts add constraint scripts_research_long_only check (kind = 'script' or long_video_id is not null);

create index if not exists scripts_short_docs_idx on scripts (short_video_id, kind, position);
create index if not exists scripts_long_docs_idx on scripts (long_video_id, kind, position);

-- Who may edit a document of this kind on this video.
create or replace function can_edit_doc(p_team uuid, p_short uuid, p_long uuid, p_kind text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select case
    when p_kind = 'research' then
      is_team_master(p_team)
      or has_team_role(p_team, 'researcher')
      or can_edit_script_row(p_team, null, p_long)
    else can_edit_script_row(p_team, p_short, p_long)
  end;
$$;

-- Images inside a document follow the same rule.
create or replace function can_edit_script_id(p_script uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select can_edit_doc(team_id, short_video_id, long_video_id, kind) from scripts where id = p_script), false);
$$;

drop policy if exists "writers create scripts" on scripts;
create policy "writers create scripts" on scripts for insert to authenticated
  with check (can_edit_doc(team_id, short_video_id, long_video_id, kind));
drop policy if exists "writers edit scripts" on scripts;
create policy "writers edit scripts" on scripts for update to authenticated
  using (can_edit_doc(team_id, short_video_id, long_video_id, kind))
  with check (can_edit_doc(team_id, short_video_id, long_video_id, kind));
drop policy if exists "masters delete scripts" on scripts;
drop policy if exists "writers delete documents" on scripts;
create policy "writers delete documents" on scripts for delete to authenticated
  using (can_edit_doc(team_id, short_video_id, long_video_id, kind));

-- A document's kind and video never change.
create or replace function scripts_kind_fixed()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A document''s kind can''t be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists scripts_kind_fixed on scripts;
create trigger scripts_kind_fixed before update on scripts for each row execute procedure scripts_kind_fixed();


-- ---------------------------------------------------------------------------
-- Inline comments
-- ---------------------------------------------------------------------------

create table if not exists script_comments (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  quote text not null check (char_length(quote) between 1 and 500),
  -- Which occurrence of the quote (0 = first), so repeated words anchor right.
  occurrence int not null default 0 check (occurrence >= 0),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null
);
create index if not exists script_comments_script_idx on script_comments (script_id, created_at);
create index if not exists script_comments_team_idx on script_comments (team_id);
create index if not exists script_comments_author_idx on script_comments (author_id);
create index if not exists script_comments_resolved_by_idx on script_comments (resolved_by);

-- Team from the document; author is whoever writes it; only resolving can change later.
create or replace function script_comments_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select team_id into new.team_id from scripts where id = new.script_id;
    new.author_id := auth.uid();
    new.created_at := now();
    new.resolved_at := null;
    new.resolved_by := null;
  else
    if new.quote is distinct from old.quote or new.occurrence is distinct from old.occurrence
       or new.script_id is distinct from old.script_id or new.team_id is distinct from old.team_id then
      raise exception 'A comment''s place in the document can''t be changed.' using errcode = '42501';
    end if;
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at
       or (new.body is distinct from old.body and old.author_id is distinct from auth.uid()) then
      raise exception 'Only resolving can change someone else''s comment.' using errcode = '42501';
    end if;
    if new.resolved_at is distinct from old.resolved_at then
      new.resolved_at := case when new.resolved_at is null then null else now() end;
      new.resolved_by := case when new.resolved_at is null then null else auth.uid() end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists script_comments_write on script_comments;
create trigger script_comments_write before insert or update on script_comments
  for each row execute procedure script_comments_write();

alter table script_comments enable row level security;
drop policy if exists "teammates read comments" on script_comments;
create policy "teammates read comments" on script_comments for select to authenticated
  using (team_id in (select my_team_ids()));
drop policy if exists "teammates comment" on script_comments;
create policy "teammates comment" on script_comments for insert to authenticated
  with check (exists (select 1 from scripts s where s.id = script_id and s.team_id in (select my_team_ids())));
drop policy if exists "teammates resolve comments" on script_comments;
create policy "teammates resolve comments" on script_comments for update to authenticated
  using (team_id in (select my_team_ids()))
  with check (team_id in (select my_team_ids()));
drop policy if exists "authors and masters delete comments" on script_comments;
create policy "authors and masters delete comments" on script_comments for delete to authenticated
  using (author_id = auth.uid() or is_team_master(team_id));
