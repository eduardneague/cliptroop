-- ============================================================================
-- 0068: Bug reports and suggestions (Settings → Account → Report)
--
--   * feedback_reports: what someone sent (bug or idea, up to 500
--     characters, up to 3 photos / videos), with a little context (app
--     version, device, page). The sender can read their own (to see it
--     arrived and when it's done); the developers read everything through
--     the server (/developer). Nobody writes it directly: submit_feedback().
--   * Storage bucket "feedback" (private, 25 MB a file, images and videos
--     only). Each person uploads into their own folder <user id>/…, can read
--     and remove their own files (to take one back before sending).
--   * submit_feedback(): checks everything (kind, length, files are really
--     theirs and uploaded, at most 10 in an hour) and saves it.
-- Staging first, then production.
-- ============================================================================

create table if not exists feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  kind text not null check (kind in ('bug', 'idea')),
  message text not null check (char_length(message) between 1 and 500),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 3),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 4000),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists feedback_reports_created_idx on feedback_reports (created_at desc);
create index if not exists feedback_reports_user_idx on feedback_reports (user_id, created_at desc);
create index if not exists feedback_reports_team_idx on feedback_reports (team_id);
alter table feedback_reports enable row level security;
revoke all on feedback_reports from anon, authenticated;
grant select on feedback_reports to authenticated;

drop policy if exists "read own reports" on feedback_reports;
create policy "read own reports"
  on feedback_reports for select to authenticated
  using (user_id = (select auth.uid()));

-- Storage ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 26214400, array['image/*', 'video/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own feedback files" on storage.objects;
create policy "upload own feedback files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "read own feedback files" on storage.objects;
create policy "read own feedback files"
  on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "remove own feedback files" on storage.objects;
create policy "remove own feedback files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Sending ---------------------------------------------------------------------

/*
 * p_files: [{ "path": "<user id>/<file>", "name": "screenshot.png",
 * "type": "image/png", "size": 123456 }], each already uploaded by the
 * caller. Returns the new report's id. Errors say what to fix.
 */
create or replace function submit_feedback(p_kind text, p_message text, p_files jsonb default '[]'::jsonb, p_context jsonb default '{}'::jsonb, p_team uuid default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_message text := btrim(coalesce(p_message, ''));
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_team uuid;
  f jsonb;
  v_path text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in again, then send it.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('bug', 'idea') then
    raise exception 'Pick Bug or Suggestion.' using errcode = '22023';
  end if;
  if char_length(v_message) < 1 then
    raise exception 'Write a few words about it.' using errcode = '22023';
  end if;
  if char_length(v_message) > 500 then
    raise exception 'Keep it to 500 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 3 then
    raise exception 'Up to 3 photos or videos.' using errcode = '22023';
  end if;
  if (select count(*) from feedback_reports where user_id = v_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You sent 10 in the last hour. Try again a little later.' using errcode = 'P0001';
  end if;

  for f in select * from jsonb_array_elements(v_files) loop
    v_path := f->>'path';
    if v_path is null or (storage.foldername(v_path))[1] is distinct from v_user::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'feedback' and o.name = v_path) then
      raise exception 'One of the files didn''t finish uploading. Add it again.' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'name', left(coalesce(f->>'name', 'file'), 120),
      'type', left(coalesce(f->>'type', ''), 60),
      'size', case when (f->>'size') ~ '^[0-9]{1,9}$' then (f->>'size')::bigint else null end));
  end loop;

  -- Only a team they're in (otherwise it's left out).
  if p_team is not null and p_team in (select my_team_ids()) then
    v_team := p_team;
  end if;

  insert into feedback_reports (user_id, team_id, kind, message, files, context)
  values (v_user, v_team, p_kind, v_message, v_clean,
          case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) <= 3000 then p_context else '{}'::jsonb end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function submit_feedback(text, text, jsonb, jsonb, uuid) from public, anon;
grant execute on function submit_feedback(text, text, jsonb, jsonb, uuid) to authenticated;
