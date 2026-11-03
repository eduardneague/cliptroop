-- ============================================================================
-- 0118: media kit templates (1.40.0).
--
-- The owner: "i want to be able to save templates as well for media kit, i
-- want to be able to set my things, then save it as a template. next time i
-- can go into that template and just modify a few things and so on, and i
-- can save as many templates as i want".
--
--   * media_kit_templates: a named copy of a team's setup (the same JSON as
--     media_kit_settings, at most 100 KB; the app checks every field). A name
--     of 1 to 80 characters with no spaces around it, each name once per team
--     whatever its case. The kit's people (media_kit_team_ids(): the team's
--     Masters and the people they let in, 0117) read, add, change and delete
--     them. Who made one and when, who changed it last and when: the
--     database's, whatever the app sends; a template stays on its team.
--
-- supabase/tests/media-kit.test.sql checks it. Additive; safe to run twice.
-- Run after 0117. Staging first, then production.
-- ============================================================================

create table if not exists media_kit_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 100000),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create unique index if not exists media_kit_templates_name_idx on media_kit_templates (team_id, lower(name));
create index if not exists media_kit_templates_created_by_idx on media_kit_templates (created_by);
create index if not exists media_kit_templates_updated_by_idx on media_kit_templates (updated_by);

alter table media_kit_templates enable row level security;
revoke all on media_kit_templates from anon, authenticated;
grant select, insert, update, delete on media_kit_templates to authenticated;

drop policy if exists "media kit people read its templates" on media_kit_templates;
create policy "media kit people read its templates" on media_kit_templates for select to authenticated
  using (team_id in (select media_kit_team_ids()));
drop policy if exists "media kit people add templates" on media_kit_templates;
create policy "media kit people add templates" on media_kit_templates for insert to authenticated
  with check (team_id in (select media_kit_team_ids()));
drop policy if exists "media kit people change templates" on media_kit_templates;
create policy "media kit people change templates" on media_kit_templates for update to authenticated
  using (team_id in (select media_kit_team_ids()))
  with check (team_id in (select media_kit_team_ids()));
drop policy if exists "media kit people delete templates" on media_kit_templates;
create policy "media kit people delete templates" on media_kit_templates for delete to authenticated
  using (team_id in (select media_kit_team_ids()));

-- Who and when: the database's. A change keeps the template's team and who made it.
create or replace function media_kit_templates_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.id := old.id;
    new.team_id := old.team_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function media_kit_templates_touch() from public, anon, authenticated;
drop trigger if exists media_kit_templates_touch on media_kit_templates;
create trigger media_kit_templates_touch before insert or update on media_kit_templates
  for each row execute procedure media_kit_templates_touch();
