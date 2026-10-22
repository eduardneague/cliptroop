/**
 * Saved wallpapers for your dashboard (1.28.0): up to three pictures, GIFs
 * or short videos (profile_wallpapers, migration 0093; the files are in the
 * "dashboard-backgrounds" bucket, your own folder; 2 MB each since 1.29.4,
 * made small before upload: lib/wallpaper-plan.ts), one of them
 * in use (profiles.dashboard_bg_path, 0092). Each keeps how bright its top
 * part is (luma, 0–100), measured on upload, so the greeting over it can be
 * dark or white: whichever reads best over the picture, with the darkening
 * and light or dark mode counted in. Pure helpers, shared by the upload, the
 * server actions, the pages and the tests.
 */

export const WALLPAPER_MAX = 3;

/** How bright the paper (the darkening layer's colour) is, as an sRGB luma 0–1, in light and dark mode. */
export const PAPER_LUMA = { light: 0.96, dark: 0.08 } as const;
/**
 * Above this (sRGB luma, 0–1) dark words read better than white ones. WCAG 2
 * puts the crossover at a relative luminance of 0.179 (about 0.46 encoded);
 * white words on mid tones read better than that suggests (APCA), so the
 * split sits a little higher: about L* 56.
 */
export const WORDS_SPLIT = 0.52;
/** How much of the picture's height is measured: its top, where the greeting and buttons sit. */
export const LUMA_BAND = 0.4;

export type Wallpaper = { id: string; path: string; luma: number | null; createdAt: string };

/** 0–100, whole; anything else is unknown (null). */
export function clampLuma(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * How bright the top of a picture is: the average sRGB luma (Rec. 709) of
 * the top `band` of the rows, 0–100. `data` is RGBA, row by row (a canvas's
 * getImageData). Transparent pixels count as the paper would show through:
 * left out.
 */
export function lumaOf(data: ArrayLike<number>, width: number, height: number, band = LUMA_BAND): number | null {
  const rows = Math.max(1, Math.min(height, Math.round(height * band)));
  let sum = 0;
  let n = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === undefined || a < 16) continue;
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      n++;
    }
  }
  return n ? clampLuma((sum / n) * 100) : null;
}

/** How bright it looks behind the words: the picture under the darkening layer (paper at `dim` %). */
export function effectiveLuma(luma: number | null, dim: number, dark: boolean): number {
  const paper = dark ? PAPER_LUMA.dark : PAPER_LUMA.light;
  const d = Math.max(0, Math.min(80, dim)) / 100;
  const l = luma === null ? paper : luma / 100;
  return l * (1 - d) + paper * d;
}

/** Dark words over this picture (else white). Unknown brightness: the theme's own (dark words in light mode). */
export const wordsDark = (luma: number | null, dim: number, dark: boolean): boolean => effectiveLuma(luma, dim, dark) > WORDS_SPLIT;

/** What a database error on a wallpaper means for the person. */
export function wallpaperError(e: { code?: string | null; message?: string | null } | null | undefined): string {
  const m = e?.message ?? "";
  if (/profile_wallpapers|relation .* does not exist/i.test(m) || e?.code === "42P01" || e?.code === "PGRST205") return "This needs the latest database update (migration 0093).";
  if (/3 wallpapers/i.test(m)) return "You can keep 3 wallpapers. Remove or replace one first.";
  if (e?.code === "23514" || e?.code === "23505") return "That file can't be used. Upload it again.";
  return "Couldn't save. Try again.";
}
