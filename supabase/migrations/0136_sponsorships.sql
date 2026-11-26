-- ============================================================================
-- 0136: Sponsorships (1.57.0): what kind of deal, every video on the channel, the product's picture.
--
-- The owner (Nov 26 2026): "i want to be able to find every single short or long video that is already posted on the
-- channel to set it here too, also i want to be able to have a system wherre some images from abxylute or gravastar
-- or those links they automatically get the picture from that website if possible." And: "lets rename it to
-- sponsorhips and have afiliates and products reviews or stuff like that becvause for some we dont get affiliates at
-- all … maybe add a tag or something so we dont have 2 separate tables … and make it so you can filter through it
-- very easily".
--
--   * affiliates.kinds: what kind of deal it is, one or more of affiliate (a code or a link that earns a cut), review
--     (the product sent to review) and paid (paid to show it). Kept in that order, without repeats. The ones already
--     there are affiliates: they were added on the Affiliates page.
--   * affiliates.long_youtube_id / short_youtube_id: a video on the team's YouTube channel that isn't one of the
--     team's projects (analytics_content lists every video the channel has, 0058/0083). In place of project_id /
--     short_id, never with them, and on the team's channel when it's set.
--   * affiliates.image_url / image_source / image_checked_at: the product's picture. "page": the server found it on
--     the product's page; "link": a picture's address someone pasted; "none": someone took it away (the server
--     doesn't look again). https only (the app's pages show https pictures only). image_checked_at: when the server
--     last looked, so a page without a picture isn't asked again for a week.
--   * A change to the picture alone isn't an edit (who and when stay as they were): the server's look happens in
--     the background, after someone opens the page.
--   * affiliate_pictures_claim(), affiliate_picture_found(): the background look (service_role only).
--   * sponsorships_ready(): App setup's check.
--
-- The tables keep their names (affiliates…); only the page is called Sponsorships now.
-- supabase/tests/sponsorships.test.sql checks it. Additive; safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The new columns
-- ---------------------------------------------------------------------------
alter table public.affiliates add column if not exists kinds text[] not null default array['affiliate']::text[];
alter table public.affiliates add column if not exists long_youtube_id text;
alter table public.affiliates add column if not exists short_youtube_id text;
alter table public.affiliates add column if not exists image_url text;
alter table public.affiliates add column if not exists image_source text;
alter table public.affiliates add column if not exists image_checked_at timestamptz;

alter table public.affiliates drop constraint if exists affiliates_kinds_ok;
alter table public.affiliates add constraint affiliates_kinds_ok
  check (cardinality(kinds) between 1 and 3 and kinds <@ array['affiliate', 'review', 'paid']::text[]);

alter table public.affiliates drop constraint if exists affiliates_youtube_ok;
alter table public.affiliates add constraint affiliates_youtube_ok check (
  (long_youtube_id is null or long_youtube_id ~ '^[A-Za-z0-9_-]{11}$')
  and (short_youtube_id is null or short_youtube_id ~ '^[A-Za-z0-9_-]{11}$')
  and (project_id is null or long_youtube_id is null)
  and (short_id is null or short_youtube_id is null)
);

alter table public.affiliates drop constraint if exists affiliates_image_ok;
alter table public.affiliates add constraint affiliates_image_ok check (
  (image_url is null or (char_length(image_url) <= 2000 and image_url ~* '^https://[^[:space:]]+$'))
  and (image_source is null or image_source in ('page', 'link', 'none'))
  and ((image_url is null) = (image_source is null or image_source = 'none'))
);

-- ---------------------------------------------------------------------------
-- 2. Writing one (0135's, with the kinds, the channel's videos, and the picture apart)
-- ---------------------------------------------------------------------------
create or replace function public.affiliates_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  picture constant text[] := array['image_url', 'image_source', 'image_checked_at'];
  new_long boolean := tg_op = 'INSERT';
  new_short boolean := tg_op = 'INSERT';
begin
  -- A linked video deleted (its link set to null by the database): nothing else changes, nobody "edited" it.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  -- Only the picture changed (the server's look in the background, or someone's choice): not an edit either.
  if tg_op = 'UPDATE' and (to_jsonb(new) - picture) = (to_jsonb(old) - picture) then
    return new;
  end if;
  new.name := btrim(new.name);
  new.product_url := nullif(btrim(coalesce(new.product_url, '')), '');
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.percentage := nullif(btrim(coalesce(new.percentage, '')), '');
  new.platform_url := nullif(btrim(coalesce(new.platform_url, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  -- What kind of deal: one or more of the three, in their order, without repeats.
  if new.kinds is null or cardinality(new.kinds) = 0 or not (new.kinds <@ array['affiliate', 'review', 'paid']::text[]) then
    raise exception 'Pick what kind of deal it is: affiliate, review or paid.' using errcode = 'check_violation';
  end if;
  new.kinds := array(
    select k from unnest(array['affiliate', 'review', 'paid']::text[]) with ordinality as t(k, i) where k = any (new.kinds) order by i
  );
  if tg_op = 'INSERT' then
    if (select count(*) from affiliates where team_id = new.team_id) >= 1000 then
      raise exception 'A team can keep 1,000 affiliates.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.team_id is distinct from old.team_id then
      raise exception 'An affiliate stays in its team.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new_long := new.long_youtube_id is distinct from old.long_youtube_id;
    new_short := new.short_youtube_id is distinct from old.short_youtube_id;
    -- Another product link: its picture may be looked for again.
    if new.product_url is distinct from old.product_url then
      new.image_checked_at := null;
    end if;
  end if;
  -- A linked video is one of the team's own.
  if new.project_id is not null and not exists (select 1 from long_video_projects p where p.id = new.project_id and p.team_id = new.team_id) then
    raise exception 'That long video isn''t on this team.' using errcode = '42501';
  end if;
  if new.short_id is not null and not exists (select 1 from short_videos s where s.id = new.short_id and s.team_id = new.team_id) then
    raise exception 'That short isn''t on this team.' using errcode = '42501';
  end if;
  -- A video only on the channel: one the team's channel lists, when it's set (it may leave the channel later).
  if new_long and new.long_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.long_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  if new_short and new.short_youtube_id is not null and not exists (
    select 1 from analytics_content c where c.team_id = new.team_id and c.platform = 'youtube' and c.external_id = new.short_youtube_id
  ) then
    raise exception 'That video isn''t on the team''s channel.' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.affiliates_write() from public, anon, authenticated;
drop trigger if exists affiliates_write on public.affiliates;
create trigger affiliates_write before insert or update on public.affiliates
  for each row execute function public.affiliates_write();

-- ---------------------------------------------------------------------------
-- 3. The background look for pictures (the server, with its own key)
-- ---------------------------------------------------------------------------
-- The next few of a team that have a product link and no picture, not taken away, not looked at in the last week:
-- marked as looked at now (so two looks at once don't take the same ones), and given to the server.
create or replace function public.affiliate_pictures_claim(p_team uuid, p_ids uuid[] default null, p_max int default 6)
returns table (id uuid, product_url text)
language sql
security definer set search_path = public
as $$
  with picked as (
    select a.id
    from affiliates a
    where a.team_id = p_team
      and a.product_url is not null
      and a.image_url is null
      and a.image_source is null
      and (a.image_checked_at is null or a.image_checked_at < now() - interval '7 days')
      and (p_ids is null or a.id = any (p_ids))
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_max, 6), 50))
    for update of a skip locked
  )
  update affiliates a set image_checked_at = now()
  from picked
  where a.id = picked.id
  returning a.id, a.product_url;
$$;
revoke all on function public.affiliate_pictures_claim(uuid, uuid[], int) from public, anon, authenticated;
grant execute on function public.affiliate_pictures_claim(uuid, uuid[], int) to service_role;

-- A picture the server found: kept only if the product link is still the one it looked at and nobody chose a
-- picture (or took it away) meanwhile.
create or replace function public.affiliate_picture_found(p_affiliate uuid, p_product_url text, p_image text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  n int;
begin
  update affiliates set image_url = p_image, image_source = 'page'
  where id = p_affiliate and product_url = p_product_url and image_url is null and image_source is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.affiliate_picture_found(uuid, text, text) from public, anon, authenticated;
grant execute on function public.affiliate_picture_found(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. App setup's check
-- ---------------------------------------------------------------------------
create or replace function public.sponsorships_ready()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'affiliates' and column_name in ('kinds', 'long_youtube_id', 'short_youtube_id', 'image_url', 'image_source', 'image_checked_at')) = 6
     and exists (select 1 from pg_proc where proname = 'affiliate_pictures_claim')
     and exists (select 1 from pg_proc where proname = 'affiliate_picture_found');
$$;
revoke all on function public.sponsorships_ready() from public, anon, authenticated;
grant execute on function public.sponsorships_ready() to service_role;

notify pgrst, 'reload schema';
