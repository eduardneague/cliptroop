-- ============================================================================
-- 0065: push notifications on phones and computers
--
--   push_subscriptions: one row per device (browser / installed app) that
--   turned notifications on. The endpoint + keys come from the browser; the
--   server encrypts every message for that one device (lib/push).
--
--   Who can do what:
--     * you see and remove your own devices (Settings → Notifications);
--     * adding / updating a device only happens through the server, after it
--       checked who you are and that the address is a real push service.
--   A device moves to whoever turns notifications on there last (shared
--   computer), and is removed when that person logs out.
--
-- Safe to run twice. Applied by the Database Action (staging on push, then
-- production on merge).
-- ============================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- "iPhone · Safari", "Android · Chrome", "Mac · Chrome" … (shown in Settings)
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures int not null default 0,
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint push_subscriptions_sizes check (length(endpoint) <= 1024 and length(p256dh) <= 128 and length(auth) <= 64 and coalesce(length(label), 0) <= 80)
);

create unique index if not exists push_subscriptions_endpoint_key on push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "own devices readable" on push_subscriptions;
create policy "own devices readable" on push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "own devices removable" on push_subscriptions;
create policy "own devices removable" on push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- No insert / update from the browser at all: the server does it.
revoke insert, update on push_subscriptions from anon, authenticated;
grant select, delete on push_subscriptions to authenticated;
