-- ============================================================================
-- 0115: a Partnerships role (1.39.0), for the people who deal with sponsors.
--
-- The owner: "i want a sponsorships role too, and only masters and people who
-- have the sponsorship role or a better name would be better for it can
-- access media kits." Called Partnerships in the app (id 'partnerships'); it
-- has no step of a video's own (role_allows_stage says no to it, as to any
-- role it doesn't name). 0116 gives it the media kit.
--
-- On its own file, as 0112 did for shorts' Filming: PostgreSQL only lets a
-- new enum value be used once the statement that adds it is committed, and
-- 0116 uses it. Safe to run twice. Staging first, then production.
-- ============================================================================

alter type role_type add value if not exists 'partnerships';
