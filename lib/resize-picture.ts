import "server-only";

/*
 * A smaller copy of a picture, for the picture routes' ?w= (1.32.3; the
 * widths are lib/picture-size.ts). WebP, about a tenth of the 1280 px
 * original's weight at 320 px. Turned the right way up first (a phone
 * photo's EXIF), never made bigger, never more than 40 million pixels in
 * (a picture made to blow up when opened).
 *
 * null: no copy (sharp isn't there, the file isn't a picture it reads, it's
 * animated, or it's already that small); then the route sends the original.
 */
export async function resizePicture(input: ArrayBuffer, width: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(Buffer.from(input), { limitInputPixels: 40_000_000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) return null;
    // Sideways in the file (EXIF 5 to 8): its width is the file's height.
    const shownWidth = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
    if (shownWidth <= width) return null;
    const out = await img.rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    // (A copy that came out heavier than the original isn't one.)
    return out.length < input.byteLength ? new Uint8Array(out) : null;
  } catch {
    return null;
  }
}
