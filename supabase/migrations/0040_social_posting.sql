-- ============================================================================
-- 0040: automatic posting (Phase B)
--
--   * social_posts: one scheduled post per short and platform. The server
--     moves it forward step by step (scheduled → uploading → processing →
--     published, or failed), saving progress after every step so a timeout
--     never loses work. `state` holds upload session details (they act like
--     passwords) and is NOT readable by clients.
--   * social_post_events: the in-app history of every step.
--   * teams.post_time_*: default posting time per platform.
--   * claim_social_posts(): hands due posts to exactly one worker at a time.
--
-- Staging first, then production.
-- ============================================================================

alter table teams
  add column if not exists post_time_youtube time not null default '17:00',
  add column if not exists post_time_instagram time not null default '18:00',
  add column if not exists post_time_tiktok time not null default '19:00';
grant update (post_time_youtube, post_time_instagram, post_time_tiktok) on teams to authenticated;


create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  short_id uuid not null references short_videos(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  account_id uuid references social_accounts(id) on delete set null,
  version_id uuid references short_video_versions(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'uploading', 'processing', 'waiting', 'published', 'failed', 'cancelled')),
  step text not null default 'start',
  progress int not null default 0 check (progress between 0 and 100),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  external_id text,
  permalink text,
  -- What to post (title, caption, privacy…). Readable by the team.
  options jsonb not null default '{}'::jsonb,
  -- Upload session details. Server only.
  state jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists social_posts_one_active
  on social_posts (short_id, platform) where status <> 'cancelled';
create index if not exists social_posts_due_idx on social_posts (next_attempt_at)
  where status in ('scheduled', 'uploading', 'processing', 'waiting');
create index if not exists social_posts_short_idx on social_posts (short_id);
create index if not exists social_posts_team_idx on social_posts (team_id);
create index if not exists social_posts_account_idx on social_posts (account_id);
create index if not exists social_posts_version_idx on social_posts (version_id);
create index if not exists social_posts_created_by_idx on social_posts (created_by);

alter table social_posts enable row level security;
revoke all on social_posts from anon, authenticated;
grant select (
  id, team_id, short_id, platform, account_id, version_id, scheduled_at, status, step, progress,
  attempts, next_attempt_at, last_error, external_id, permalink, options, note, created_by,
  created_at, updated_at, published_at
) on social_posts to authenticated;
drop policy if exists "teammates see scheduled posts" on social_posts;
create policy "teammates see scheduled posts" on social_posts for select to authenticated
  using (team_id in (select my_team_ids()));
-- No write policies: only the server writes, after checking roles.


create table if not exists social_post_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references social_posts(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  kind text not null,
  message text,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists social_post_events_post_idx on social_post_events (post_id, created_at);
create index if not exists social_post_events_team_idx on social_post_events (team_id);
create index if not exists social_post_events_actor_idx on social_post_events (actor_id);
alter table social_post_events enable row level security;
revoke all on social_post_events from anon, authenticated;
grant select on social_post_events to authenticated;
drop policy if exists "teammates see post history" on social_post_events;
create policy "teammates see post history" on social_post_events for select to authenticated
  using (team_id in (select my_team_ids()));


-- Hand out due posts to one worker at a time (a lock that expires, so a
-- crashed run is picked up again a few minutes later).
create or replace function claim_social_posts(p_limit int default 5)
returns setof social_posts
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  with due as (
    select id from social_posts
     where status in ('scheduled', 'uploading', 'processing', 'waiting')
       and next_attempt_at <= now()
       and (locked_until is null or locked_until < now())
     order by next_attempt_at
     limit greatest(1, least(p_limit, 20))
     for update skip locked
  )
  update social_posts p
     set locked_until = now() + interval '3 minutes'
    from due
   where p.id = due.id
  returning p.*;
end;
$$;
revoke all on function claim_social_posts(int) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- The every-minute timer (pg_cron + pg_net). It calls the app's posting
-- endpoint with the secret from Supabase Vault. Two Vault secrets must be
-- added once per project (see the setup steps):
--   posting_url  = https://<your site>/api/cron/posting
--   cron_secret  = the same value as CRON_SECRET in Vercel
-- Until they exist, the job simply does nothing.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function run_posting_tick()
returns void
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'posting_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- Only wake the app when something is actually due.
  if not exists (
    select 1 from social_posts
     where status in ('scheduled', 'uploading', 'processing', 'waiting') and next_attempt_at <= now()
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function run_posting_tick() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('vplanner-posting');
exception when others then null;
end $$;
select cron.schedule('vplanner-posting', '* * * * *', $$ select run_posting_tick(); $$);
