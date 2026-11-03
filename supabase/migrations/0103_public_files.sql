-- ============================================================================
-- 0103: the public file buckets take only what they're for (1.31.1)
--
--   * avatars, team-logos, thumbnails, script-images: pictures only (PNG,
--     JPEG, WebP, GIF, AVIF, HEIC, BMP, TIFF), at most 25 MB, the same as the
--     app's own limit. Never an SVG or a web page: anyone can open a public
--     file by its address, and those would run a script when opened. The
--     app turns an SVG into a PNG before it uploads (lib/image/compress.ts
--     PICTURE_TYPES is the same list).
--   * comment-attachments: any kind of file still (people attach PDFs,
--     documents, project files), at most 25 MB like the app says. The app
--     keeps a web page, an SVG or a script attached to a comment as a plain
--     download.
--   * Nothing else changes: who may upload, read or delete stays as it was,
--     no public bucket can be listed by anyone, and every file already there
--     stays. Private buckets (videos, frames, package thumbnails, the library,
--     feedback) are untouched.
--
-- Safe to run twice. Staging first, then production.
-- ============================================================================

update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']
 where id in ('avatars', 'team-logos', 'thumbnails', 'script-images');

update storage.buckets
   set file_size_limit = 26214400
 where id = 'comment-attachments';
