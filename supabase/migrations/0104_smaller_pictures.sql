-- ============================================================================
-- 0104: pictures, smaller (1.31.3)
--
--   * avatars, team-logos, script-images: 5 MB at most (25 MB since 0103).
--   * thumbnails and package-thumbs (Thumbnail Studio): 15 MB at most, and
--     package-thumbs takes pictures only (the same list as 0103; it took
--     anything before).
--   * The app checks the same before anything goes up (lib/image/limits.ts)
--     and first makes every picture as small as it can be where it's shown
--     (lib/image/compress.ts), so what's stored is usually a few hundred KB.
--     Videos, comment files, feedback and wallpapers keep their own limits.
--   * Files already stored stay as they are.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

update storage.buckets
   set file_size_limit = 5242880
 where id in ('avatars', 'team-logos', 'script-images');

update storage.buckets
   set file_size_limit = 15728640
 where id = 'thumbnails';

update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']
 where id = 'package-thumbs';
