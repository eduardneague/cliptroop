-- Checks for 0085 (Sync now in the background, YouTube's history): a master
-- or a scheduler sends one call per connected platform (an account that
-- needs reconnecting is skipped), a second press within 90 seconds sends
-- nothing, other teammates can't, and the history column is there. Run by
-- scripts/db/test-from-scratch.sh; each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c8', 'sm@example.com'),
  ('00000000-0000-4000-8000-0000000000d8', 'sn@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000c8', 'sm@example.com'),
  ('00000000-0000-4000-8000-0000000000d8', 'sn@example.com')
on conflict do nothing;
-- (Creating a team makes its owner a master member.)
insert into teams (id, name, slug, owner_id) values ('10000000-0000-4000-8000-0000000000c8', 'Team S', 'sync-team-s', '00000000-0000-4000-8000-0000000000c8');
insert into team_members (id, team_id, user_id, invited_email, status) values
  ('20000000-0000-4000-8000-0000000000d8', '10000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-0000000000d8', 'sn@example.com', 'active')
on conflict do nothing;
insert into member_roles (team_member_id, role) values ('20000000-0000-4000-8000-0000000000d8', 'editor') on conflict do nothing;
insert into social_accounts (team_id, platform, external_id, access_token_enc, status) values
  ('10000000-0000-4000-8000-0000000000c8', 'youtube', 'UCS', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000c8', 'tiktok', 'TTS', 'v1:x', 'active'),
  ('10000000-0000-4000-8000-0000000000c8', 'instagram', 'IGS', 'v1:x', 'needs_reconnect')
on conflict do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

select vault.create_secret('https://app.example.com/api/cron/posting', 'posting_url');
select vault.create_secret('0123456789abcdef0123456789abcdef', 'cron_secret');

do $$
begin
  if (select count(*) from information_schema.columns where table_name = 'analytics_syncs' and column_name in ('history_from', 'history_done', 'sync_requested_at')) <> 3 then
    raise exception 'analytics_syncs: history_from, history_done and sync_requested_at exist';
  end if;
  if (select column_default from information_schema.columns where table_name = 'analytics_syncs' and column_name = 'history_done') is distinct from 'false' then
    raise exception 'analytics_syncs.history_done starts false';
  end if;
  if (select count(*) from information_schema.columns where table_name = 'analytics_content_days' and column_name in ('subscribers_gained', 'avg_view_seconds')) <> 2 then
    raise exception 'analytics_content_days: a video''s subscribers and average view per day';
  end if;
end $$;

-- A teammate who is neither a master nor a scheduler can't.
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d8');
set local role authenticated;
do $$
begin
  begin
    perform analytics_sync_now('10000000-0000-4000-8000-0000000000c8');
    raise exception 'analytics_sync_now: an editor can''t sync';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
commit;

-- The master: one call per connected platform, then nothing for 90 seconds.
select set_config('test.queued', (select count(*) from net.http_request_queue)::text, false);
begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c8');
set local role authenticated;
do $$
declare
  n int;
begin
  n := analytics_sync_now('10000000-0000-4000-8000-0000000000c8');
  if n <> 2 then
    raise exception 'analytics_sync_now: YouTube and TikTok (not the account that needs reconnecting), got %', n;
  end if;
  if analytics_sync_now('10000000-0000-4000-8000-0000000000c8') <> -1 then
    raise exception 'analytics_sync_now: pressed again within 90 seconds: wait';
  end if;
end $$;
reset role;
commit;
do $$
begin
  if (select count(*) from net.http_request_queue) - current_setting('test.queued')::int <> 2 then
    raise exception 'analytics_sync_now: two calls queued';
  end if;
  if not exists (select 1 from net.http_request_queue where convert_from(body, 'utf8') like '%"job": "analytics"%' and convert_from(body, 'utf8') like '%"live": true%' and convert_from(body, 'utf8') like '%"platform": "tiktok"%') then
    raise exception 'analytics_sync_now: each call copies one platform, then its live counts';
  end if;
  if (select count(*) from analytics_syncs where team_id = '10000000-0000-4000-8000-0000000000c8' and sync_requested_at is not null) <> 2 then
    raise exception 'analytics_sync_now: when it was asked is kept per platform';
  end if;
end $$;

delete from analytics_syncs where team_id = '10000000-0000-4000-8000-0000000000c8';
delete from social_accounts where team_id = '10000000-0000-4000-8000-0000000000c8';
delete from vault.secrets where name in ('posting_url', 'cron_secret');
