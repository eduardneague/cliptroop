-- ============================================================================
-- 0061 · Revenue across all streams (1.7)
--   * analytics_revenue_daily: YouTube's own split of the estimated revenue:
--     ads, YouTube Premium (the rest = memberships, Supers, Shopping…), and
--     gross ad revenue. Shorts vs long videos use the existing `content` rows.
--   * revenue_entries: money that doesn't come through YouTube's numbers:
--     sponsorships, brand deals, affiliate links, other platforms, merch…
--     Seen by the same people as revenue (masters + people they chose);
--     added, changed and removed by masters only.
-- Run on staging, then production. Safe to run more than once.
-- ============================================================================

alter table analytics_revenue_daily add column if not exists ad_revenue numeric(14, 4);
alter table analytics_revenue_daily add column if not exists premium_revenue numeric(14, 4);
alter table analytics_revenue_daily add column if not exists gross_revenue numeric(14, 4);

create table if not exists revenue_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  day date not null,
  source text not null check (source in ('sponsorship', 'brand_deal', 'affiliate', 'youtube_other', 'facebook', 'instagram', 'tiktok', 'merch', 'other')),
  amount numeric(14, 2) not null check (amount > 0 and amount < 100000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  note text check (note is null or char_length(note) <= 300),
  short_id uuid references short_videos(id) on delete set null,
  project_id uuid references long_video_projects(id) on delete set null,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists revenue_entries_team_day_idx on revenue_entries (team_id, day);

alter table revenue_entries enable row level security;
revoke all on revenue_entries from anon, authenticated;
grant select, insert, update, delete on revenue_entries to authenticated;
drop policy if exists "revenue people read entries" on revenue_entries;
create policy "revenue people read entries" on revenue_entries for select to authenticated
  using (can_view_revenue(team_id));
drop policy if exists "masters add entries" on revenue_entries;
create policy "masters add entries" on revenue_entries for insert to authenticated
  with check (is_master_of(team_id));
drop policy if exists "masters change entries" on revenue_entries;
create policy "masters change entries" on revenue_entries for update to authenticated
  using (is_master_of(team_id)) with check (is_master_of(team_id));
drop policy if exists "masters remove entries" on revenue_entries;
create policy "masters remove entries" on revenue_entries for delete to authenticated
  using (is_master_of(team_id));

-- Who added it and when are the server's to say.
create or replace function revenue_entries_stamp()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.team_id := old.team_id;
  end if;
  return new;
end;
$$;
drop trigger if exists revenue_entries_stamp on revenue_entries;
create trigger revenue_entries_stamp before insert or update on revenue_entries
  for each row execute procedure revenue_entries_stamp();
