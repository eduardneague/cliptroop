-- 0126 (1.47.0): TikTok fetches the video itself (PULL_FROM_URL).
--
-- TikTok's Content Sharing Guidelines: "If video resources are already on API
-- Clients' servers, do not use FILE_UPLOAD; use PULL_FROM_URL instead", from an
-- address TikTok has verified for the app (URL properties → URL prefix). The
-- approved video stays in the private review-videos bucket; for the few
-- minutes TikTok needs, a copy sits in this bucket under a random name (folder
-- v/) and goes once TikTok has it (lib/social/publishers/tiktok.ts; the daily
-- cleanup removes any copy older than 6 hours). The bucket's root holds
-- TikTok's verification file, which the owner uploads once.
--
-- Public, because TikTok can't sign in. Nobody can list it (no read rule names
-- it) and nobody signed in can write to it (no rule at all): only the server's
-- key copies into it. Videos up to 4 GB (TikTok's own limit) and the
-- verification file (text/plain). Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tiktok-pull', 'tiktok-pull', true, 4294967296, array['video/mp4', 'video/quicktime', 'video/webm', 'text/plain'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
