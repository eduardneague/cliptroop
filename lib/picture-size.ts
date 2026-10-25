/**
 * Pictures at the size they're shown (1.32.3). Thumbnail Studio's pictures
 * and Ideate's sketches are kept up to 1280 px wide (what YouTube shows); the
 * dashboard, the calendar, the long videos list and search show them 46 to
 * 300 px wide. Their addresses take ?w= with one of these widths and the
 * server sends a copy that wide (lib/resize-picture.ts); the address never
 * changes, so the browser keeps it.
 */
export const PICTURE_WIDTHS = [160, 320, 640] as const;
export type PictureWidth = (typeof PICTURE_WIDTHS)[number];

/** ?w= as asked: one of the widths, or null (the picture as it's kept). */
export function pictureWidth(raw: string | null | undefined): PictureWidth | null {
  if (!raw) return null;
  const n = Number(raw);
  // Written the one way ("160", not "0160"): one address, one copy, for each picture and width.
  return String(n) === raw && (PICTURE_WIDTHS as readonly number[]).includes(n) ? (n as PictureWidth) : null;
}

/** A Thumbnail Studio picture (its package entry), at a width or as it's kept. */
export const studioThumb = (entryId: string, w?: PictureWidth) => `/api/package-thumb/${entryId}${w ? `?w=${w}` : ""}`;

/** An Ideate sketch (its project_thumbnails row), at a width or as it's kept. */
export const sketchThumb = (thumbnailId: string, w?: PictureWidth) => `/api/project-thumb/${thumbnailId}${w ? `?w=${w}` : ""}`;
