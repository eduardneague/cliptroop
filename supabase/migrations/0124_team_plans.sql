-- 0124 (1.45.0): a plan for each team, a way to ask for one, and the storage each team uses.
--
-- The owner (Oct 30 2026), opening ClipTroop to the public: "no free trial for now, no free plan for now. we will have
-- to add usage for each team as well, so if supabase is 100GBs, each plan should have some storage related to it".
--
--   * teams.plan: 'studio' or 'network' (null: none yet). A team made in the app (by someone who signed up on the
--     website) starts with none, sees the plans and asks for one; ClipTroop sets it (Developer → Plans, with the service
--     role). Every team there before this ran is ClipTroop's own and keeps working: Network (the column's default fills
--     them in). So does a team ClipTroop makes itself (the service role, the SQL editor).
--   * teams.plan_storage_gb: the team's storage when it isn't the plan's own (lib/plans.ts: Studio 50 GB, Network 500).
--   * teams.plan_requested / _at / _note / _by: the plan a team's master asked for (request_team_plan()).
--   * Nobody signed in sets any of these on their own (a guard puts them back), not even on a team they make.
--   * team_storage_usage(team): what the team's files take, for its people (Team → Team → Plan and storage).
--     Files are the team's by their folder, as developer_usage() counts them (0075, 0089), with the buckets since.
--   * A team without a plan can't add files (a restrictive policy on storage.objects): the app's pages are closed to it
--     too (the plan page instead), and connecting a social account is refused (app/api/social/[platform]/connect).
--     Files that aren't a team's (profile pictures, wallpapers, bug reports) aren't affected.
--
-- supabase/tests/team-plans.test.sql checks it. Additive; safe to run twice.

alter table public.teams add column if not exists plan text default 'network';
alter table public.teams add column if not exists plan_storage_gb integer;
alter table public.teams add column if not exists plan_set_at timestamptz;
alter table public.teams add column if not exists plan_requested text;
alter table public.teams add column if not exists plan_requested_at timestamptz;
alter table public.teams add column if not exists plan_request_note text;
alter table public.teams add column if not exists plan_requested_by uuid references auth.users(id) on delete set null;
create index if not exists teams_plan_requested_by_idx on public.teams (plan_requested_by);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_plan_check') then
    alter table public.teams add constraint teams_plan_check check (plan is null or plan in ('studio', 'network'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_plan_requested_check') then
    alter table public.teams add constraint teams_plan_requested_check check (plan_requested is null or plan_requested in ('studio', 'network'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_plan_storage_gb_check') then
    alter table public.teams add constraint teams_plan_storage_gb_check check (plan_storage_gb is null or plan_storage_gb between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_plan_request_note_check') then
    alter table public.teams add constraint teams_plan_request_note_check check (plan_request_note is null or char_length(plan_request_note) <= 1000);
  end if;
end;
$$;

-- Signed in (or not), a team's plan and its request stay as they are: a new team starts with none, and a change from the
-- app keeps the old values. ClipTroop's own reads (the service role) and request_team_plan() (as its owner) set them.
create or replace function public.teams_plan_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := null;
      new.plan_storage_gb := null;
      new.plan_set_at := null;
      new.plan_requested := null;
      new.plan_requested_at := null;
      new.plan_request_note := null;
      new.plan_requested_by := null;
    else
      new.plan := old.plan;
      new.plan_storage_gb := old.plan_storage_gb;
      new.plan_set_at := old.plan_set_at;
      new.plan_requested := old.plan_requested;
      new.plan_requested_at := old.plan_requested_at;
      new.plan_request_note := old.plan_request_note;
      new.plan_requested_by := old.plan_requested_by;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.teams_plan_guard() from public, anon;
drop trigger if exists teams_plan_guard on public.teams;
create trigger teams_plan_guard
  before insert or update on public.teams
  for each row execute procedure public.teams_plan_guard();

-- A team's master asks for a plan (the note: who they are, how many people, anything to know). Asking again replaces the
-- last one; a team that has a plan asks for another the same way.
create or replace function public.request_team_plan(p_team uuid, p_plan text, p_note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not is_team_master(p_team) then
    raise exception 'Only the team''s masters can ask for a plan.' using errcode = '42501';
  end if;
  if p_plan is null or p_plan not in ('studio', 'network') then
    raise exception 'Pick Studio or Network.' using errcode = '22023';
  end if;
  update teams
     set plan_requested = p_plan,
         plan_requested_at = now(),
         plan_request_note = nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
         plan_requested_by = auth.uid()
   where id = p_team;
end;
$$;
revoke all on function public.request_team_plan(uuid, text, text) from public, anon;
grant execute on function public.request_team_plan(uuid, text, text) to authenticated;

-- What a team's files take, by bucket: its people only (else nothing).
create or replace function public.team_storage_usage(p_team uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public, storage
as $$
declare
  v_prefix text := p_team::text || '/%';
  v_out jsonb;
begin
  if auth.uid() is not null and not exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and status = 'active') then
    return null;
  end if;
  with files as (
    -- In the team's own folder.
    select o.bucket_id, o.metadata
      from storage.objects o
     where o.bucket_id in ('team-logos', 'review-videos', 'long-review-videos', 'package-thumbs', 'mockup-library', 'script-sketches', 'media-kit', 'business-docs', 'video-frames')
       and o.name like v_prefix
    union all
    -- In a long video's folder.
    select o.bucket_id, o.metadata
      from storage.objects o
      join long_video_projects p on p.team_id = p_team and o.name like p.id::text || '/%'
     where o.bucket_id in ('thumbnails', 'comment-attachments')
    union all
    -- In a script's folder.
    select o.bucket_id, o.metadata
      from storage.objects o
      join scripts s on s.team_id = p_team and o.name like s.id::text || '/%'
     where o.bucket_id = 'script-images'
  ),
  sized as (
    select bucket_id, case when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint else 0 end as bytes from files
  ),
  per as (
    select bucket_id, count(*) as files, coalesce(sum(bytes), 0) as bytes from sized group by bucket_id
  )
  select jsonb_build_object(
    'bytes', coalesce((select sum(bytes) from per), 0),
    'files', coalesce((select sum(files) from per), 0),
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('id', bucket_id, 'files', files, 'bytes', bytes) order by bytes desc) from per), '[]'::jsonb),
    'at', now()
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.team_storage_usage(uuid) from public, anon;
grant execute on function public.team_storage_usage(uuid) to authenticated, service_role;

-- The team a file is in, by its folder (the rules above); null when it isn't a team's.
create or replace function public.storage_team_of(p_bucket text, p_name text)
returns uuid
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_first text := split_part(coalesce(p_name, ''), '/', 1);
  v_team uuid;
begin
  if v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if p_bucket in ('team-logos', 'review-videos', 'long-review-videos', 'package-thumbs', 'mockup-library', 'script-sketches', 'media-kit', 'business-docs', 'video-frames') then
    return v_first::uuid;
  elsif p_bucket in ('thumbnails', 'comment-attachments') then
    select team_id into v_team from long_video_projects where id = v_first::uuid;
  elsif p_bucket = 'script-images' then
    select team_id into v_team from scripts where id = v_first::uuid;
  end if;
  return v_team;
end;
$$;
revoke all on function public.storage_team_of(text, text) from public, anon;
grant execute on function public.storage_team_of(text, text) to authenticated, service_role;

-- Whether a file may be added there: anything that isn't a team's, or a team that has a plan.
create or replace function public.storage_upload_allowed(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select t.plan is not null from teams t where t.id = public.storage_team_of(p_bucket, p_name)), true);
$$;
revoke all on function public.storage_upload_allowed(text, text) from public, anon;
grant execute on function public.storage_upload_allowed(text, text) to authenticated, service_role;

-- Restrictive: on top of each bucket's own policies (which still decide who may), never instead of them.
drop policy if exists "a team adds files with a plan" on storage.objects;
create policy "a team adds files with a plan"
  on storage.objects as restrictive for insert to authenticated
  with check (public.storage_upload_allowed(bucket_id, name));
drop policy if exists "a team replaces files with a plan" on storage.objects;
create policy "a team replaces files with a plan"
  on storage.objects as restrictive for update to authenticated
  using (true)
  with check (public.storage_upload_allowed(bucket_id, name));
