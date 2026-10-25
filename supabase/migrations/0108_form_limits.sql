-- ============================================================================
-- 0108: free text has a limit in the database too (1.31.15)
--
-- The app's forms and actions already cap what they send (and Next.js
-- takes at most 1 MB per action), but signed-in people can also write some
-- rows straight through Supabase's API, past the app. These columns had no
-- limit there at all: a title, a hook, a comment or a team name of any
-- size. Now each has one, well above anything the app itself sends (it
-- shows its own message long before), so nothing that works today stops
-- working:
--
--   long videos: title 300, theme / subtheme 500, hook 10,000, notes
--     50,000, budget notes 20,000, description 20,000 (YouTube's is 5,000),
--     visibility 32, YouTube id 64, at most 20 video types
--   comments 20,000, review pins 8,000, alternative titles 300, tags 100
--   file names 255 / 500, storage paths 1,024, picture addresses 2,048
--   a script's searchable text 1,000,000 (the app sends 500,000 at most)
--   profiles: name 200, the old bio 2,000, the dashboard's layout 64 KB;
--     a new username is 3 to 20 letters, numbers or underscores, as
--     Settings says (checked when it changes, so an old one never blocks
--     saving anything else)
--   teams: name 200, slug 200, time zone 64, colours 32
--
-- The limits only apply to what's written from now on (NOT VALID: nothing
-- already saved is read or changed). supabase/tests/form-limits.test.sql
-- fails for a new text column a signed-in person can write without one.
--
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comment_attachments', 'file_name', 'char_length(file_name) <= 255'),
      ('comment_attachments', 'file_path', 'char_length(file_path) <= 1024'),
      ('comment_attachments', 'mime_type', 'char_length(mime_type) <= 255'),
      ('long_video_projects', 'title', 'char_length(title) <= 300'),
      ('long_video_projects', 'theme', 'char_length(theme) <= 500'),
      ('long_video_projects', 'subtheme', 'char_length(subtheme) <= 500'),
      ('long_video_projects', 'hook', 'char_length(hook) <= 10000'),
      ('long_video_projects', 'notes', 'char_length(notes) <= 50000'),
      ('long_video_projects', 'budget_notes', 'char_length(budget_notes) <= 20000'),
      ('long_video_projects', 'description', 'char_length(description) <= 20000'),
      ('long_video_projects', 'visibility', 'char_length(visibility) <= 32'),
      ('long_video_projects', 'youtube_video_id', 'char_length(youtube_video_id) <= 64'),
      ('long_video_projects', 'video_type', 'cardinality(video_type) <= 20 and char_length(array_to_string(video_type, '','')) <= 1000'),
      ('long_video_versions', 'file_name', 'char_length(file_name) <= 500'),
      ('long_video_versions', 'storage_path', 'char_length(storage_path) <= 1024'),
      ('short_video_versions', 'file_name', 'char_length(file_name) <= 500'),
      ('short_video_versions', 'storage_path', 'char_length(storage_path) <= 1024'),
      ('package_entries', 'thumbnail_storage_path', 'char_length(thumbnail_storage_path) <= 1024'),
      ('project_thumbnails', 'storage_path', 'char_length(storage_path) <= 1024'),
      ('project_comments', 'body', 'char_length(body) <= 20000'),
      ('project_titles', 'title', 'char_length(title) <= 300'),
      ('video_review_pins', 'body', 'char_length(body) <= 8000'),
      ('scripts', 'content_text', 'char_length(content_text) <= 1000000'),
      ('profiles', 'avatar_url', 'char_length(avatar_url) <= 2048'),
      ('profiles', 'bio', 'char_length(bio) <= 2000'),
      ('profiles', 'full_name', 'char_length(full_name) <= 200'),
      ('profiles', 'dashboard_layout', 'pg_column_size(dashboard_layout) <= 65536'),
      ('role_colors', 'color', 'char_length(color) <= 32'),
      ('tags', 'color', 'char_length(color) <= 32'),
      ('tags', 'label', 'char_length(label) <= 100'),
      ('teams', 'name', 'char_length(name) <= 200'),
      ('teams', 'slug', 'char_length(slug) <= 200'),
      ('teams', 'timezone', 'char_length(timezone) <= 64'),
      ('teams', 'color', 'char_length(color) <= 32'),
      ('teams', 'logo_url', 'char_length(logo_url) <= 2048')
    ) as t(tbl, col, rule)
  loop
    -- Only where the table and column exist (they all do once 0001–0107 have run).
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.tbl and column_name = c.col) then
      execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.tbl || '_' || c.col || '_limit');
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.tbl || '_' || c.col || '_limit', c.rule);
    end if;
  end loop;
end $$;

-- A new username: 3 to 20 letters, numbers or underscores (Settings' own
-- rule). Only when it changes: an older one doesn't stop anything else
-- being saved.
create or replace function profiles_check_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is not null
     and new.username is distinct from (case when tg_op = 'UPDATE' then old.username end)
     and new.username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3–20 characters: letters, numbers, underscores only.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function profiles_check_username() from public, anon, authenticated;

drop trigger if exists profiles_check_username on profiles;
create trigger profiles_check_username
  before insert or update of username on profiles
  for each row execute function profiles_check_username();
