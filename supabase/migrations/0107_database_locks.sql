-- ============================================================================
-- 0107: the database's own locks (1.31.14)
--
-- An audit of every table, rule, database function and file bucket. What it
-- found, and what changes:
--
--   1. Someone who isn't signed in (Supabase's "anon" key is in every
--      browser) could still call 51 of the database's functions directly.
--      None answered anything useful without a sign-in, but none needed to
--      be callable either. Now someone who isn't signed in can't read,
--      change or call anything in the app's part of the database, and new
--      tables start out that way too (new functions: the test below fails
--      for one that anon could call). Signed-in people keep exactly what
--      they had.
--   2. Signed-in people had the right to empty a table outright (TRUNCATE,
--      which skips the row rules), or to hang triggers and references on
--      one. The app never does any of that; Supabase's own API can't
--      either, but nothing should rest on that. Gone. The 14 tables only
--      the server uses (no row rules at all) now refuse signed-in people
--      outright too, instead of answering nothing.
--   3. Profiles: any signed-in account could read every profile, with its
--      email address and settings. Accounts are made by invitation, but
--      Supabase accepts a sign-up from anyone with the app's public key
--      unless "Allow new users to sign up" is off (App setup, card 10), so
--      a stranger could have listed every user's email. Now you see the
--      profiles of: yourself; everyone on a team you're on, and everyone
--      who used to be (team_past_members, so what they made still shows
--      their name); the people with a live invite to a team you're a Master
--      of; and whoever invited you. A profile page (/u/…) still shows
--      anyone's name, username, picture and bio to any signed-in person
--      (profile_card), and you can still find anyone to invite by name or
--      username, in the search bar (search_people) or Team → Invite
--      (people_to_invite), but someone's email only finds them when it's
--      typed in full, and no email is ever sent back.
--   4. New accounts: the account trigger no longer puts a new account into
--      an old-style email invite (team_members rows "invited" by email,
--      before in-app invites in 0013). Whoever made an account with that
--      email (anyone, while sign-ups are open) would have joined the team.
--   5. Team defaults for long videos (Researcher, Filmer, Writer, Editor,
--      Packager, Publisher) must be active members of the same team, like
--      the shorts' defaults (0036). Ones that aren't are cleared.
--   6. Two helpers answered for any team or document without asking who's
--      asking (a team's date, a document's Review/Staging people). Only the
--      database's own functions use them now.
--   7. Files: the rule for uploading editing-idea drawings never worked
--      (its "name" meant the script's name, not the file's) and nothing
--      uses it: the app signs each drawing's upload itself. Gone. Comment
--      attachments take only kinds a browser shows or downloads, never a
--      web page, an SVG or a script (the app already stored those as plain
--      downloads; the bucket now refuses them too). Short videos for review
--      take only the video kinds the app takes (MP4, MOV, WebM).
--
-- Checked and left as they were: every table has row rules (98); every
-- function that runs with the database's own rights sets its search path;
-- there are no views; submit_feedback keeps only a team you're on; nobody
-- can list a public bucket; team_id_for_project, review_path_ok and
-- long_review_path_ok answer for any id (the file and project rules need
-- them) but only say which team something is in or whether a path is
-- well-formed.
--
-- Additive; safe to run twice. Staging first, then production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Someone who isn't signed in: nothing
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- New tables and sequences too: Supabase's own defaults hand each new one to
-- anon as well. (A new function is still everyone's by Postgres' own rule
-- until its migration says otherwise: "revoke all on function … from
-- public, anon"; supabase/tests/database-locks.test.sql fails for one that
-- doesn't. Changing that rule for everything the postgres role makes would
-- also take functions away from signed-in people in extensions enabled
-- later.)
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Every function: not anon, not "everyone". Signed-in people and the server
-- keep the functions they could call, now granted to them by name.
do $$
declare
  f record;
begin
  for f in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as signed_in,
           has_function_privilege('service_role', p.oid, 'execute') as server
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- An extension's own functions (pgcrypto, when it lives in public) stay as the extension made them.
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on routine %s from public, anon', f.sig);
    if f.signed_in then
      execute format('grant execute on routine %s to authenticated', f.sig);
    end if;
    if f.server then
      execute format('grant execute on routine %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Signed-in people: rows through the rules, nothing more
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
do $$
begin
  -- Postgres 17's MAINTAIN (VACUUM, LOCK TABLE, …): not for the app's people either.
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
    execute 'alter default privileges in schema public revoke maintain on tables from anon, authenticated';
  end if;
end $$;

-- The tables only the server uses (row rules on, no rule lets anyone in):
-- signed-in people get "permission denied" instead of an empty answer.
revoke all on table app_errors, job_runs, oauth_states, objective_sync, outlier_alerts, outlier_locks,
  outlier_quota, outlier_search_cache, outlier_search_log, posting_runs, sign_in_failures, status_samples,
  status_state, team_counters
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profiles: yours, your teams' and your invites'
-- ---------------------------------------------------------------------------
-- 3a. Who used to be on a team. Kept when someone is removed or leaves, so
-- the team still sees who made what. Only the database reads it.
create table if not exists team_past_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  left_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_past_members_user_idx on team_past_members (user_id);
alter table team_past_members enable row level security;
revoke all on table team_past_members from anon, authenticated;

create or replace function team_members_note_past()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Not when the team or the account itself is being deleted (then there's
  -- nobody to show it to, and nothing to point at).
  if old.user_id is not null and old.status = 'active'
     and exists (select 1 from teams where id = old.team_id)
     and exists (select 1 from profiles where id = old.user_id) then
    insert into team_past_members (team_id, user_id) values (old.team_id, old.user_id)
    on conflict (team_id, user_id) do update set left_at = now();
  end if;
  return null;
end;
$$;
revoke all on function team_members_note_past() from public, anon, authenticated;

drop trigger if exists team_members_note_past on team_members;
create trigger team_members_note_past
  after delete on team_members
  for each row execute function team_members_note_past();

-- Everyone who already left: whoever's name is on something of the team's.
insert into team_past_members (team_id, user_id)
select distinct x.team_id, x.user_id
  from (
    select team_id, created_by as user_id from long_video_projects
    union all select team_id, edited_by from long_video_projects
    union all select team_id, filmed_by from long_video_projects
    union all select team_id, reviewed_by from long_video_projects
    union all select team_id, updated_by from long_video_projects
    union all select team_id, created_by from short_videos
    union all select team_id, updated_by from short_videos
    union all select team_id, updated_by from scripts
    union all select team_id, author_id from script_comments
    union all select team_id, resolved_by from script_comments
    union all select team_id, added_by from script_doc_people
    union all select team_id, handed_by from script_handoffs
    union all select team_id, uploaded_by from short_video_versions
    union all select team_id, uploaded_by from long_video_versions
    union all select team_id, created_by from meetings
    union all select team_id, user_id from meeting_attendees
    union all select team_id, created_by from meeting_actions
    union all select team_id, owner_id from meeting_actions
    union all select team_id, created_by from objectives
    union all select team_id, updated_by from objective_targets
    union all select team_id, created_by from projections
    union all select team_id, granted_by from revenue_access
    union all select team_id, user_id from revenue_access
    union all select team_id, created_by from revenue_entries
    union all select team_id, connected_by from social_accounts
    union all select team_id, actor_id from social_audit_log
    union all select team_id, created_by from social_posts
    union all select team_id, actor_id from social_post_events
    union all select team_id, updated_by from team_day_limits
    union all select team_id, added_by from team_dictionary
    union all select team_id, user_id from tasks
    union all select team_id, invited_by from team_invites
    union all select team_id, from_user_id from ownership_transfer_requests
    union all select team_id, to_user_id from ownership_transfer_requests
    union all select team_id, added_by from outlier_blocked
    union all select team_id, created_by from outlier_folders
    union all select team_id, added_by from outlier_niche_channels
    union all select team_id, created_by from outlier_niches
    union all select team_id, saved_by from outlier_saves
    union all select team_id, added_by from outlier_tracked
    union all select p.team_id, c.author_id from project_comments c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.author_id from video_review_pins c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.created_by from package_entries c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.created_by from package_titles c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.posted_by from long_video_posts c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.added_by from long_video_scripters c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.author_id from long_video_comments c join long_video_projects p on p.id = c.project_id
    union all select p.team_id, c.resolved_by from long_video_comments c join long_video_projects p on p.id = c.project_id
    union all select s.team_id, c.added_by from short_scripters c join short_videos s on s.id = c.short_id
    union all select s.team_id, c.author_id from short_video_comments c join short_videos s on s.id = c.short_id
    union all select s.team_id, c.resolved_by from short_video_comments c join short_videos s on s.id = c.short_id
    union all select s.team_id, c.actor_id from short_video_events c join short_videos s on s.id = c.short_id
    union all select s.team_id, c.posted_by from short_video_posts c join short_videos s on s.id = c.short_id
  ) x
 where x.team_id is not null and x.user_id is not null
   and exists (select 1 from teams t where t.id = x.team_id)
   and exists (select 1 from profiles p where p.id = x.user_id)
   and not exists (select 1 from team_members m where m.team_id = x.team_id and m.user_id = x.user_id)
on conflict (team_id, user_id) do nothing;

-- 3b. The profiles you can see, worked out once per question (the rule below
-- asks "is this one of them?" of each row).
create or replace function visible_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- You.
  select auth.uid() where auth.uid() is not null
  -- Everyone on a team you're on (invited or in), and everyone who was.
  union
  select m.user_id from team_members m
   where m.team_id in (select my_team_ids()) and m.user_id is not null
  union
  select pm.user_id from team_past_members pm
   where pm.team_id in (select my_team_ids())
  -- The people with a live invite to a team you're a Master of.
  union
  select i.invited_user_id from team_invites i
   where i.team_id in (select my_master_team_ids())
     and i.status = 'pending' and i.expires_at > now()
  -- Whoever invited you (while the invite is live).
  union
  select i.invited_by from team_invites i
   where i.invited_user_id = auth.uid() and i.invited_by is not null
     and i.status = 'pending' and i.expires_at > now()
$$;
revoke all on function visible_profile_ids() from public, anon;
grant execute on function visible_profile_ids() to authenticated, service_role;

drop policy if exists "profiles are readable by any authenticated user" on profiles;
drop policy if exists "profiles: yours, your teams' and your invites'" on profiles;
create policy "profiles: yours, your teams' and your invites'"
  on profiles for select to authenticated
  using (id in (select visible_profile_ids()));

-- 3c. A profile page's card (/u/<username or id>): name, username, picture,
-- bio, when they joined, whether they show their teams. For anyone signed in.
create or replace function profile_card(p_handle text)
returns table (id uuid, username text, full_name text, bio text, avatar_url text, created_at timestamptz, teams_visible boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h text := btrim(coalesce(p_handle, ''));
begin
  if auth.uid() is null or h = '' or char_length(h) > 100 then
    return;
  end if;
  if h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return query
      select p.id, p.username, p.full_name, p.bio, p.avatar_url, p.created_at, p.teams_visible
        from profiles p where p.id = h::uuid;
  else
    -- A username, whatever its capitals (unique that way: profiles_username_unique).
    return query
      select p.id, p.username, p.full_name, p.bio, p.avatar_url, p.created_at, p.teams_visible
        from profiles p where lower(p.username) = lower(h);
  end if;
end;
$$;
revoke all on function profile_card(text) from public, anon;
grant execute on function profile_card(text) to authenticated, service_role;

-- 3d. Team → Invite people: someone to invite to a team you're a Master of,
-- by their name or username, or their whole email. Not people already on
-- the team or with a live invite to it. Never their email.
create or replace function people_to_invite(p_team uuid, p_term text)
returns table (id uuid, username text, full_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  term text := left(lower(btrim(coalesce(p_term, ''))), 64);
  pat text;
begin
  if auth.uid() is null or p_team is null or char_length(term) < 2
     or not (p_team in (select my_master_team_ids())) then
    return;
  end if;
  pat := '%' || search_escape_like(term) || '%';
  return query
    select p.id, p.username, p.full_name, p.avatar_url
      from profiles p
     where (lower(p.username) like pat
            or lower(p.full_name) like pat
            or (position('@' in term) > 0 and lower(p.email) = term))
       and not exists (select 1 from team_members m where m.team_id = p_team and m.user_id = p.id)
       and not exists (
         select 1 from team_invites i
          where i.team_id = p_team and i.invited_user_id = p.id
            and i.status = 'pending' and i.expires_at > now()
       )
     order by (lower(p.username) = term or lower(p.full_name) = term or lower(p.email) = term) desc,
              (lower(coalesce(p.username, '')) like search_escape_like(term) || '%'
               or lower(coalesce(p.full_name, '')) like search_escape_like(term) || '%') desc,
              lower(coalesce(p.username, p.full_name, '')), p.id
     limit 8;
end;
$$;
revoke all on function people_to_invite(uuid, text) from public, anon;
grant execute on function people_to_invite(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. New accounts: a profile, nothing else
-- ---------------------------------------------------------------------------
-- (Joining a team is the in-app invite since 0013; the old "an account with
-- this email joins the team" is gone.)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;
revoke all on function handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Long videos' default people: active members of the same team
-- ---------------------------------------------------------------------------
update teams t set default_long_scripter_member_id = null
 where default_long_scripter_member_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_scripter_member_id and m.team_id = t.id and m.status = 'active');
update teams t set default_long_researcher_id = null
 where default_long_researcher_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_researcher_id and m.team_id = t.id and m.status = 'active');
update teams t set default_long_filmer_id = null
 where default_long_filmer_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_filmer_id and m.team_id = t.id and m.status = 'active');
update teams t set default_long_editor_id = null
 where default_long_editor_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_editor_id and m.team_id = t.id and m.status = 'active');
update teams t set default_long_packager_id = null
 where default_long_packager_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_packager_id and m.team_id = t.id and m.status = 'active');
update teams t set default_long_publisher_id = null
 where default_long_publisher_id is not null
   and not exists (select 1 from team_members m where m.id = t.default_long_publisher_id and m.team_id = t.id and m.status = 'active');

create or replace function teams_check_long_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m uuid;
begin
  foreach m in array array[new.default_long_scripter_member_id, new.default_long_researcher_id, new.default_long_filmer_id,
                           new.default_long_editor_id, new.default_long_packager_id, new.default_long_publisher_id] loop
    if m is not null and not exists (
      select 1 from team_members where id = m and team_id = new.id and status = 'active'
    ) then
      raise exception 'Defaults must be active members of this team.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function teams_check_long_defaults() from public, anon, authenticated;

drop trigger if exists teams_check_long_defaults on teams;
create trigger teams_check_long_defaults
  before insert or update of default_long_scripter_member_id, default_long_researcher_id, default_long_filmer_id,
    default_long_editor_id, default_long_packager_id, default_long_publisher_id on teams
  for each row execute function teams_check_long_defaults();

-- ---------------------------------------------------------------------------
-- 6. Helpers that answer for anything: the database's own
-- ---------------------------------------------------------------------------
-- A team's date (the shorts' queue uses it) and a document's Review/Staging
-- people (is_script_step_person, script_hand_off, … use it): all of those
-- run with the database's own rights, so nobody else needs to call them.
revoke execute on function team_today(uuid) from authenticated;
revoke execute on function script_step_member_ids(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Files
-- ---------------------------------------------------------------------------
drop policy if exists "teammates upload sketches" on storage.objects;

-- Comment attachments: pictures (never an SVG), videos, sound, fonts, PDFs,
-- text, documents, spreadsheets, slides, design files and archives, or a
-- plain download (lib/image/compress.ts ATTACHMENT_TYPES is the same list).
update storage.buckets
   set allowed_mime_types = array[
     'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
     'video/*', 'audio/*', 'font/*',
     'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'text/rtf', 'application/rtf', 'application/json', 'text/vtt', 'application/x-subrip',
     'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
     'application/vnd.apple.pages', 'application/vnd.apple.numbers', 'application/vnd.apple.keynote',
     'application/postscript', 'application/illustrator', 'application/x-photoshop', 'image/vnd.adobe.photoshop',
     'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
     'application/gzip', 'application/x-gzip', 'application/x-tar',
     'application/octet-stream'
   ]
 where id = 'comment-attachments';

-- Short videos for review: the kinds the uploader takes (modules/review/lib/limits.ts VIDEO_TYPES).
update storage.buckets
   set allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm']
 where id = 'review-videos';

-- ---------------------------------------------------------------------------
-- 8. The search bar's people (global_search, 0090)
-- ---------------------------------------------------------------------------
-- Anyone, by their name or username, as before (so a Master can invite
-- someone from the search bar); by an email only when it's typed in full,
-- except the people you can see anyway (3b), who are also found by the
-- start of theirs. The part before the @ stands in for a name only for
-- those, or when you typed that whole email. Never an email itself.
--
-- Supabase runs migrations as a role that isn't a superuser: a function's
-- "set pg_trgm.…" below is only accepted once pg_trgm is loaded in this
-- session (0089, section 7). One call of its own does that.
do $$
declare
  s text := (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm');
begin
  if s is not null then
    execute format('select %I.similarity(%L, %L)', s, 'a', 'a');
  end if;
end $$;

create or replace function search_people(p_term text, p_limit int default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  me uuid := auth.uid();
  term text := left(lower(trim(coalesce(p_term, ''))), 64);
  lim int := least(greatest(coalesce(p_limit, 6), 1), 20);
  seen uuid[];
  esc text;
  contains_pat text;
  prefix_pat text;
  found jsonb;
begin
  if me is null or char_length(term) < 2 then
    return '[]'::jsonb;
  end if;
  seen := array(select visible_profile_ids());
  esc := search_escape_like(ltrim(term, '#'));
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';

  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_name' order by x.score desc, x.sort_name), '[]'::jsonb)
    into found
    from (
      select
        pr.id, pr.username, pr.full_name, pr.avatar_url,
        case when pr.username is null and pr.full_name is null and (pr.id = any (seen) or lower(pr.email) = term)
             then split_part(pr.email, '@', 1) end as email_name,
        coalesce(pr.username, pr.full_name,
                 case when pr.id = any (seen) or lower(pr.email) = term then split_part(pr.email, '@', 1) end) as sort_name,
        (pr.id = me) as is_self,
        exists (
          select 1 from team_members tm
          where tm.user_id = pr.id and tm.status = 'active'
            and tm.team_id in (select my_team_ids())
        ) as is_teammate,
        coalesce((
          select jsonb_agg(tm.team_id) from team_members tm
          where tm.user_id = pr.id and tm.team_id in (select my_master_team_ids())
        ), '[]'::jsonb) as member_of,
        coalesce((
          select jsonb_agg(ti.team_id) from team_invites ti
          where ti.invited_user_id = pr.id and ti.status = 'pending'
            and ti.expires_at > now()
            and ti.team_id in (select my_master_team_ids())
        ), '[]'::jsonb) as invited_to,
        (case
           when lower(pr.username) = term or lower(pr.full_name) = term or lower(pr.email) = term then 3
           when lower(pr.username) like prefix_pat or lower(pr.full_name) like prefix_pat then 2
           else 0
         end
         + greatest(
             word_similarity(term, lower(coalesce(pr.username, ''))),
             word_similarity(term, lower(coalesce(pr.full_name, '')))
           )) as score
      from profiles pr
      where lower(pr.username) like contains_pat
         or lower(pr.full_name) like contains_pat
         or term <% lower(coalesce(pr.username, ''))
         or term <% lower(coalesce(pr.full_name, ''))
         or (position('@' in term) > 0
             and (lower(pr.email) = term or (pr.id = any (seen) and lower(pr.email) like prefix_pat)))
      order by score desc
      limit lim
    ) x;
  return found;
end;
$$;
revoke all on function search_people(text, int) from public, anon;
grant execute on function search_people(text, int) to authenticated, service_role;

-- global_search: as in 0090, with its people from search_people.

create or replace function global_search(q text, max_results int default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  term text := left(lower(trim(coalesce(q, ''))), 64);
  lim int := least(greatest(coalesce(max_results, 6), 1), 20);
  esc text;
  contains_pat text;
  prefix_pat text;
  num int;
  -- 3+ characters: also look inside scripts, notes, captions and descriptions.
  deep boolean;
  people jsonb := '[]'::jsonb;
  projects jsonb := '[]'::jsonb;
  shorts jsonb := '[]'::jsonb;
  teams_found jsonb := '[]'::jsonb;
  docs_found jsonb := '[]'::jsonb;
  meetings_found jsonb := '[]'::jsonb;
  actions_found jsonb := '[]'::jsonb;
  objectives_found jsonb := '[]'::jsonb;
  projections_found jsonb := '[]'::jsonb;
  master_teams jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url
         ) order by t.name), '[]'::jsonb)
    into master_teams
    from teams t
   where t.id in (select my_master_team_ids());
  -- "#12" or "12" → entry number lookup (shorts + long videos).
  if term ~ '^#?[0-9]{1,7}$' then
    num := ltrim(term, '#')::int;
  end if;
  if length(term) < 2 and num is null then
    return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                              'teams', teams_found, 'master_teams', master_teams,
                              'scripts', docs_found, 'meetings', meetings_found, 'actions', actions_found,
                              'objectives', objectives_found, 'projections', projections_found);
  end if;
  esc := search_escape_like(ltrim(term, '#'));
  contains_pat := '%' || esc || '%';
  prefix_pat := esc || '%';
  deep := num is null and length(term) >= 3;

  -- PEOPLE (skipped for pure number lookups): search_people (0107).
  if num is null then
    people := search_people(term, lim);
  end if;

  -- LONG VIDEOS (RLS: your teams only). The picture: Thumbnail Studio's
  -- winner (1.25.0), else the first thumbnail idea. Also found by another
  -- title, or (3+ letters) by its theme, hook, notes or description.
  select coalesce(jsonb_agg(to_jsonb(x) - 'updated_at' order by x.score desc, x.updated_at desc), '[]'::jsonb)
    into projects
    from (
      select
        p.id, p.entry_number, p.title, p.stage, p.expected_date, p.updated_at,
        alt.title as matched_title,
        other.field as matched_field,
        case when other.field is not null then search_snippet(other.txt, other.pos, 120) end as matched_text,
        th.storage_path as thumbnail_path,
        win.id as winner_id,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and p.entry_number = num then 4
           when lower(p.title) = term then 3
           when lower(p.title) like prefix_pat then 2
           when lower(p.title) like contains_pat then 1
           when alt.title is not null then 0.8
           when other.field is not null then 0.5
           else 0
         end
         + word_similarity(term, lower(p.title))) as score
      from long_video_projects p
      join teams t on t.id = p.team_id
      left join lateral (
        select pt.title from project_titles pt
        where pt.project_id = p.id
          and lower(pt.title) like contains_pat
          and lower(pt.title) <> lower(p.title)
        order by pt.position
        limit 1
      ) alt on true
      left join lateral (
        select f.field, f.txt, strpos(lower(f.txt), term) as pos
        from (values (1, 'theme', p.theme), (2, 'subtheme', p.subtheme), (3, 'hook', p.hook),
                     (4, 'description', p.description), (5, 'notes', p.notes)) f(n, field, txt)
        where deep and f.txt is not null and lower(f.txt) like contains_pat
        order by f.n
        limit 1
      ) other on true
      left join lateral (
        select th.storage_path from project_thumbnails th
        where th.project_id = p.id
        order by th.position
        limit 1
      ) th on true
      left join lateral (
        select e.id from package_entries e
        where e.project_id = p.id and e.is_winner and e.thumbnail_storage_path is not null
        order by e.position
        limit 1
      ) win on true
      where (num is not null and p.entry_number = num)
         or lower(p.title) like contains_pat
         or term <% lower(p.title)
         or alt.title is not null
         or other.field is not null
      order by score desc, p.updated_at desc
      limit lim
    ) x;

  -- SHORTS (RLS: your teams only). Also found (3+ letters) by their caption.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc, x.entry_number desc), '[]'::jsonb)
    into shorts
    from (
      select
        s.id, s.entry_number, s.title, s.stage, s.planned_date,
        (select count(*) from short_video_posts sp
          where sp.short_id = s.id and sp.platform = any(s.platforms)) as posted_count,
        cardinality(s.platforms) as platform_count,
        case when deep and lower(s.title) not like contains_pat and lower(s.caption) like contains_pat
             then 'caption' end as matched_field,
        case when deep and lower(s.title) not like contains_pat and lower(s.caption) like contains_pat
             then search_snippet(s.caption, strpos(lower(s.caption), term), 120) end as matched_text,
        jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
        (case
           when num is not null and s.entry_number = num then 4
           when lower(s.title) = term then 3
           when lower(s.title) like prefix_pat then 2
           when lower(s.title) like contains_pat then 1
           when deep and lower(s.caption) like contains_pat then 0.5
           else 0
         end
         + word_similarity(term, lower(s.title))) as score
      from short_videos s
      join teams t on t.id = s.team_id
      where (num is not null and s.entry_number = num)
         or lower(s.title) like contains_pat
         or term <% lower(s.title)
         or (deep and lower(s.caption) like contains_pat)
      order by score desc
      limit lim
    ) x;

  -- TEAMS (skipped for pure number lookups)
  if num is null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.score desc, x.name), '[]'::jsonb)
      into teams_found
      from (
        select
          t.id, t.name, t.color, t.logo_url,
          (t.id in (select my_master_team_ids())) as is_master,
          (select count(*) from team_members tm where tm.team_id = t.id and tm.status = 'active') as member_count,
          (case
             when lower(t.name) = term then 3
             when lower(t.name) like prefix_pat then 2
             else 0
           end + word_similarity(term, lower(t.name))) as score
        from teams t
        where lower(t.name) like contains_pat or term <% lower(t.name)
        order by score desc
        limit lim
      ) x;
  end if;

  if deep then
    -- SCRIPTS AND RESEARCH: search_docs (your teams' documents, with the index).
    docs_found := search_docs(term, lim);

    -- MEETINGS (RLS: your teams'): by title, agenda or notes. The nearest
    -- in time first among equals.
    select coalesce(jsonb_agg(to_jsonb(x) - 'gap' order by x.score desc, x.gap), '[]'::jsonb)
      into meetings_found
      from (
        select
          m.id, m.title, m.starts_at, m.duration_min, m.status, m.location,
          case when lower(m.title) like contains_pat or term <% lower(m.title) then null
               when lower(m.agenda) like contains_pat then 'agenda'
               when lower(m.notes) like contains_pat then 'notes' end as matched_field,
          case when lower(m.title) like contains_pat or term <% lower(m.title) then null
               when lower(m.agenda) like contains_pat then search_snippet(m.agenda, strpos(lower(m.agenda), term), 120)
               when lower(m.notes) like contains_pat then search_snippet(m.notes, strpos(lower(m.notes), term), 120) end as matched_text,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          abs(extract(epoch from (m.starts_at - now()))) as gap,
          (case
             when lower(m.title) = term then 3
             when lower(m.title) like prefix_pat then 2
             when lower(m.title) like contains_pat then 1
             when term <% lower(m.title) then 0.6
             else 0.5
           end + word_similarity(term, lower(m.title))) as score
        from meetings m
        join teams t on t.id = m.team_id
        where lower(m.title) like contains_pat
           or term <% lower(m.title)
           or lower(m.agenda) like contains_pat
           or lower(m.notes) like contains_pat
        order by score desc, gap
        limit lim
      ) x;

    -- MEETING ACTION ITEMS (RLS: your teams'): open ones first.
    select coalesce(jsonb_agg(to_jsonb(x) - 'created_at' order by x.score desc, x.done, x.created_at desc), '[]'::jsonb)
      into actions_found
      from (
        select
          a.id, a.text, a.meeting_id, a.due_date, a.created_at,
          (a.done_at is not null) as done,
          (a.owner_id is not null and a.owner_id = auth.uid()) as mine,
          coalesce(pr.username, pr.full_name, split_part(pr.email, '@', 1)) as owner_name,
          m.title as meeting_title,
          m.starts_at as meeting_at,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(a.text) = term then 3
             when lower(a.text) like prefix_pat then 2
             when lower(a.text) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(a.text))) as score
        from meeting_actions a
        join meetings m on m.id = a.meeting_id
        join teams t on t.id = a.team_id
        left join profiles pr on pr.id = a.owner_id
        where lower(a.text) like contains_pat or term <% lower(a.text)
        order by score desc, done, a.created_at desc
        limit lim
      ) x;

    -- OBJECTIVES (RLS: your teams')
    select coalesce(jsonb_agg(to_jsonb(x) - 'position' order by x.score desc, x.position), '[]'::jsonb)
      into objectives_found
      from (
        select
          o.id, o.title, o.period, o.color, o.position,
          (o.paused_at is not null) as paused,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(o.title) = term then 3
             when lower(o.title) like prefix_pat then 2
             when lower(o.title) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(o.title))) as score
        from objectives o
        join teams t on t.id = o.team_id
        where lower(o.title) like contains_pat or term <% lower(o.title)
        order by score desc, o.position
        limit lim
      ) x;

    -- PROJECTIONS (RLS: your teams', money ones only if you see revenue)
    select coalesce(jsonb_agg(to_jsonb(x) - 'position' order by x.score desc, x.position), '[]'::jsonb)
      into projections_found
      from (
        select
          p.id, p.title, p.deadline, p.color, p.position,
          (p.achieved_at is not null) as achieved,
          (p.ended_at is not null) as ended,
          (p.archived_at is not null) as archived,
          jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'logo_url', t.logo_url) as team,
          (case
             when lower(p.title) = term then 3
             when lower(p.title) like prefix_pat then 2
             when lower(p.title) like contains_pat then 1
             else 0
           end + word_similarity(term, lower(p.title))) as score
        from projections p
        join teams t on t.id = p.team_id
        where lower(p.title) like contains_pat or term <% lower(p.title)
        order by score desc, p.position
        limit lim
      ) x;
  end if;

  return jsonb_build_object('people', people, 'projects', projects, 'shorts', shorts,
                            'teams', teams_found, 'master_teams', master_teams,
                            'scripts', docs_found, 'meetings', meetings_found, 'actions', actions_found,
                            'objectives', objectives_found, 'projections', projections_found);
end;
$$;

revoke all on function global_search(text, int) from public, anon;
grant execute on function global_search(text, int) to authenticated;

notify pgrst, 'reload schema';
