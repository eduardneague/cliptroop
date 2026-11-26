-- ============================================================================
-- 0139: Where a company's money goes, and its picture (1.60.0)
-- ============================================================================
-- The owner (Nov 26 2026): "i also want a setting where i can select where the money goes to, either bank account or
-- paypal or other payments like this, not with details just like a quick icon with those thing", then "also add the
-- ability to add a picture for each company too please".
--
--   * affiliates.payout: where the company pays, one word (no account details): bank, paypal, wise, payoneer,
--     revolut, credit (store credit or gift cards) or other; null: not said.
--   * affiliates.picture_url: the company's picture (its logo): a link (https) to one on the web, or one uploaded here.
--   * sponsor-pictures: the bucket the uploaded ones go in (public, as team-logos and 0103's rules for them: pictures
--     only, 5 MB, and nobody lists it: a picture opens only by its exact, random address). The people who manage the
--     team's sponsorships (the Masters and the people they let in, affiliate_team_ids()) add them to the team's own
--     folder (<team id>/…); the server removes the ones nothing uses any more.
--
-- Both columns go with the rest of the company: everyone on the team reads them, the managers change them (0135's
-- row level security and grants, on the whole table). The (old, unread) image_url of 0136 isn't this.
-- supabase/tests/company-extras.test.sql checks it. Additive; safe to run twice.
-- ============================================================================

alter table public.affiliates add column if not exists payout text;
alter table public.affiliates add column if not exists picture_url text;

alter table public.affiliates drop constraint if exists affiliates_payout_ok;
alter table public.affiliates add constraint affiliates_payout_ok
  check (payout is null or payout in ('bank', 'paypal', 'wise', 'payoneer', 'revolut', 'credit', 'other'));

alter table public.affiliates drop constraint if exists affiliates_picture_ok;
alter table public.affiliates add constraint affiliates_picture_ok
  check (picture_url is null or (picture_url ~ '^https://[^[:space:]]+$' and length(picture_url) <= 2000));

-- ---------------------------------------------------------------------------
-- The uploaded pictures
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsor-pictures', 'sponsor-pictures', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "sponsorship managers add company pictures" on storage.objects;
create policy "sponsorship managers add company pictures"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sponsor-pictures'
    and (storage.foldername(name))[1] in (select t::text from public.affiliate_team_ids() t)
  );

-- (No rule to read or remove them: a public bucket isn't listed (0103), and the server removes, with its own key.)
