-- Checks for 0084 (the new Analytics pages): a range's top videos add up
-- YouTube's own days and the others' running totals (a video posted in the
-- range starts from 0, a count that dropped is no gain), only for the
-- platforms asked; the last 60 minutes split into 10-minute slots; both
-- only for the reader's own teams. Run by scripts/db/test-from-scratch.sh;
-- each check raises on failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a7', 'pa@example.com'),
  ('00000000-0000-4000-8000-0000000000b7', 'pb@example.com')
on conflict do nothing;
insert into profiles (id, email) values
  ('00000000-0000-4000-8000-0000000000a7', 'pa@example.com'),
  ('00000000-0000-4000-8000-0000000000b7', 'pb@example.com')
on conflict do nothing;
insert into teams (id, name, slug, owner_id) values
  ('10000000-0000-4000-8000-0000000000a7', 'Team PA', 'pages-team-a', '00000000-0000-4000-8000-0000000000a7'),
  ('10000000-0000-4000-8000-0000000000b7', 'Team PB', 'pages-team-b', '00000000-0000-4000-8000-0000000000b7');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- A range of two days: 4 and 3 days ago (the morning after it: 2 days ago).
insert into analytics_content (team_id, platform, external_id, kind, published_at, views) values
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', 'long', now() - interval '30 days', 5000),
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y2', 'short', now() - interval '30 days', 900),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't1', 'short', now() - interval '30 days', 1300),
  -- Posted in the range: everything it has counts.
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't2', 'short', (current_date - 4)::timestamptz + interval '12 hours', 70),
  -- Older, but first seen in the range: only what came after.
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't3', 'short', now() - interval '60 days', 520),
  ('10000000-0000-4000-8000-0000000000a7', 'instagram', 'i4', 'short', now() - interval '60 days', 90);
insert into analytics_content_days (team_id, platform, external_id, day, source, views) values
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', current_date - 4, 'daily', 100),
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', current_date - 3, 'daily', 50),
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', current_date - 12, 'daily', 999),
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y2', current_date - 3, 'daily', 30),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't1', current_date - 5, 'total', 900),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't1', current_date - 4, 'total', 1000),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't1', current_date - 2, 'total', 1300),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't1', current_date - 1, 'total', 9999),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't2', current_date - 3, 'total', 40),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't2', current_date - 2, 'total', 70),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't3', current_date - 3, 'total', 500),
  ('10000000-0000-4000-8000-0000000000a7', 'tiktok', 't3', current_date - 2, 'total', 520),
  -- A count that went down: no gain, not listed.
  ('10000000-0000-4000-8000-0000000000a7', 'instagram', 'i4', current_date - 4, 'total', 100),
  ('10000000-0000-4000-8000-0000000000a7', 'instagram', 'i4', current_date - 2, 'total', 90);

-- Counts within minutes: 100 at 25 minutes ago, 160 at 5 minutes ago (60 in 20 minutes).
insert into analytics_live (team_id, platform, external_id, at, views, likes, comments) values
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', now() - interval '25 minutes', 100, 10, 1),
  ('10000000-0000-4000-8000-0000000000a7', 'youtube', 'y1', now() - interval '5 minutes', 160, 16, 3),
  ('10000000-0000-4000-8000-0000000000b7', 'youtube', 'z', now() - interval '25 minutes', 1, 0, 0),
  ('10000000-0000-4000-8000-0000000000b7', 'youtube', 'z', now() - interval '5 minutes', 500, 0, 0);

begin;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a7');
set local role authenticated;
do $$
declare
  got text;
  total bigint;
  slots int;
  first_slot timestamptz;
  last_slot timestamptz;
begin
  select string_agg(external_id || ':' || views || ':' || from_totals, ',' order by views desc, external_id) into got
    from analytics_top_content('10000000-0000-4000-8000-0000000000a7', current_date - 4, current_date - 3, 10);
  if got is distinct from 't1:300:true,y1:150:false,t2:70:true,y2:30:false,t3:20:true' then
    raise exception 'analytics_top_content: YouTube days + running totals, biggest first (got %)', got;
  end if;
  if (select count(*) from analytics_top_content('10000000-0000-4000-8000-0000000000a7', current_date - 4, current_date - 3, 2)) <> 2 then
    raise exception 'analytics_top_content: at most p_limit videos';
  end if;
  select string_agg(external_id, ',' order by views desc) into got
    from analytics_top_content('10000000-0000-4000-8000-0000000000a7', current_date - 4, current_date - 3, 10, array['youtube']);
  if got is distinct from 'y1,y2' then
    raise exception 'analytics_top_content: only the platforms asked (got %)', got;
  end if;
  -- The dates the other way round mean the same range.
  if (select count(*) from analytics_top_content('10000000-0000-4000-8000-0000000000a7', current_date - 3, current_date - 4, 10)) <> 5 then
    raise exception 'analytics_top_content: from and to in any order';
  end if;
  if exists (select 1 from analytics_top_content('10000000-0000-4000-8000-0000000000b7', current_date - 4, current_date - 3, 10)) then
    raise exception 'analytics_top_content: another team''s videos are never read (RLS)';
  end if;

  select sum(views), count(*), min(at), max(at) into total, slots, first_slot, last_slot
    from analytics_live_buckets('10000000-0000-4000-8000-0000000000a7', 60, 10);
  -- (Each slot is rounded on its own: the sum can be one off.)
  if total not between 59 and 61 then
    raise exception 'analytics_live_buckets: 60 views in the last hour (got %)', total;
  end if;
  if slots < 2 then
    raise exception 'analytics_live_buckets: 20 minutes of views spread over the slots they happened in (got % slots)', slots;
  end if;
  if last_slot > now() or first_slot < now() - interval '60 minutes' then
    raise exception 'analytics_live_buckets: 10-minute slots within the last hour (got % to %)', first_slot, last_slot;
  end if;
  -- The slots end now: each starts a whole number of 10 minutes before it.
  if exists (select 1 from analytics_live_buckets('10000000-0000-4000-8000-0000000000a7', 60, 10) where abs(round(extract(epoch from (now() - at))::numeric) % 600) > 0) then
    raise exception 'analytics_live_buckets: slots of 10 minutes ending now';
  end if;
  if (select sum(views) from analytics_live_buckets('10000000-0000-4000-8000-0000000000a7', 60, 10)) <> (select sum(views) from analytics_live_gains('10000000-0000-4000-8000-0000000000a7', 60)) then
    raise exception 'analytics_live_buckets: the slots add up to the last 60 minutes'' gains';
  end if;
  if (select sum(likes) from analytics_live_buckets('10000000-0000-4000-8000-0000000000a7', 60, 10)) not between 5 and 7 then
    raise exception 'analytics_live_buckets: likes too';
  end if;
  if exists (select 1 from analytics_live_buckets('10000000-0000-4000-8000-0000000000b7', 60, 10)) then
    raise exception 'analytics_live_buckets: another team''s counts are never read (RLS)';
  end if;
  -- However much is asked: at most two days of slots.
  if (select count(*) from analytics_live_buckets('10000000-0000-4000-8000-0000000000a7', 100000, 10)) > 288 then
    raise exception 'analytics_live_buckets: at most two days of slots';
  end if;
end $$;
reset role;
commit;

delete from analytics_live where team_id in ('10000000-0000-4000-8000-0000000000a7', '10000000-0000-4000-8000-0000000000b7');
delete from analytics_content_days where team_id = '10000000-0000-4000-8000-0000000000a7';
delete from analytics_content where team_id = '10000000-0000-4000-8000-0000000000a7';
