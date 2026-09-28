-- ============================================================================
-- 0039: connected social accounts
--
--   * social_accounts: one YouTube / Instagram / TikTok account per team.
--     Tokens are encrypted by our server (AES-256-GCM, key only in the
--     server's environment) before they're stored, AND the token columns
--     can't be read by logged-in users at all (column privileges): only
--     the server's service key reads them. Teammates see name, picture,
--     status.
--   * oauth_states: short-lived sign-in state (anti-forgery + PKCE).
--     Server only.
--   * social_audit_log: who connected / disconnected / refreshed what.
--     Masters and schedulers can read it; only the server writes it.
--
-- Staging first, then production.
-- ============================================================================

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  external_id text not null,
  display_name text,
  username text,
  avatar_url text,
  -- Encrypted by the server ("v1:<iv>:<tag>:<data>"). Never readable by clients.
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  last_error text,
  connected_by uuid references profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  unique (team_id, platform)
);
create index if not exists social_accounts_connected_by_idx on social_accounts (connected_by);

alter table social_accounts enable row level security;

-- Clients may read the safe columns only; tokens stay server-side.
revoke all on social_accounts from anon, authenticated;
grant select (
  id, team_id, platform, external_id, display_name, username, avatar_url,
  token_expires_at, scopes, status, last_error, connected_by, connected_at, last_refreshed_at
) on social_accounts to authenticated;

drop policy if exists "teammates see connected accounts" on social_accounts;
create policy "teammates see connected accounts" on social_accounts for select to authenticated
  using (team_id in (select my_team_ids()));
-- No insert / update / delete policies: only the server (service key)
-- writes, after checking the person is a master or scheduler.


create table if not exists oauth_states (
  state text primary key,
  team_id uuid not null references teams(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  user_id uuid not null references profiles(id) on delete cascade,
  code_verifier text,
  created_at timestamptz not null default now()
);
create index if not exists oauth_states_created_idx on oauth_states (created_at);
create index if not exists oauth_states_team_idx on oauth_states (team_id);
create index if not exists oauth_states_user_idx on oauth_states (user_id);
alter table oauth_states enable row level security;
revoke all on oauth_states from anon, authenticated;


create table if not exists social_audit_log (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  platform text not null,
  action text not null check (action in ('connected', 'reconnected', 'disconnected', 'refresh_failed', 'refreshed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists social_audit_log_team_idx on social_audit_log (team_id, created_at desc);
create index if not exists social_audit_log_actor_idx on social_audit_log (actor_id);
alter table social_audit_log enable row level security;
revoke all on social_audit_log from anon, authenticated;
grant select on social_audit_log to authenticated;

drop policy if exists "masters and schedulers read social history" on social_audit_log;
create policy "masters and schedulers read social history" on social_audit_log for select to authenticated
  using (is_team_master(team_id) or has_team_role(team_id, 'publisher'));

-- Deliberately NOT added to Realtime: live updates send whole rows, and
-- token columns must never travel to a browser, even encrypted.
