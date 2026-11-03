/*
 * How big a picture anyone may pick (1.31.3): 5 MB, a thumbnail 15 MB.
 * Each one is then made as small as it can be in the browser before it goes
 * up (lib/image/compress.ts), and the buckets refuse anything bigger too
 * (migration 0104). Videos and other files keep their own limits. Pure: the
 * pickers, the server side and the tests share it.
 */

export const PICTURE_MAX_MB = 5;
export const THUMBNAIL_MAX_MB = 15;
export const PICTURE_MAX_BYTES = PICTURE_MAX_MB * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = THUMBNAIL_MAX_MB * 1024 * 1024;

export type PictureKind = "picture" | "thumbnail";

export const pictureMaxBytes = (kind: PictureKind = "picture") => (kind === "thumbnail" ? THUMBNAIL_MAX_BYTES : PICTURE_MAX_BYTES);

/** 1.4 MB, 820 KB. */
export function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why this picture is too big to pick (null: it's fine). */
export function pictureTooBig(file: { name?: string; size: number }, kind: PictureKind = "picture"): string | null {
  if (file.size <= pictureMaxBytes(kind)) return null;
  const what = file.name ? `${file.name} is ${sizeText(file.size)}.` : `That picture is ${sizeText(file.size)}.`;
  return kind === "thumbnail" ? `${what} Thumbnails can be up to ${THUMBNAIL_MAX_MB} MB.` : `${what} Pictures can be up to ${PICTURE_MAX_MB} MB.`;
}
