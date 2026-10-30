/**
 * A brand's logo, made ready in the browser before it's stored (1.44.0): drawn whole (an SVG too, as a picture: the
 * bucket takes no SVG, it can carry a script), the empty margin round it cut away (see-through, or the plain colour of
 * its corners), at most 800 × 400, as a WebP with its see-through parts kept (a PNG where WebP can't be made). Logos come
 * with all sorts of margins; cut to what's drawn, each fills its tile on the page the same way.
 *
 * `contentBox`, `nameFromFile` and `kitUploadPath` are pure (tests/media-kit.test.ts); `prepareLogo` needs a browser.
 */
import { compressImage, safeFileName } from "@/lib/image/compress";

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The box of what's drawn in a picture (RGBA pixels, w × h): the pixels that aren't see-through and (on an opaque
 * picture) aren't the colour its four corners share. The whole picture when its corners don't agree (a photo, a logo
 * on a pattern); null when nothing is drawn.
 */
export function contentBox(px: ArrayLike<number>, w: number, h: number, tol = 30): Box | null {
  if (w < 1 || h < 1) return null;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const diff = (i: number, r: number, g: number, b: number) => Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b);
  const clear = corners.some((i) => px[i + 3] < 16);
  let bg: [number, number, number] = [0, 0, 0];
  if (!clear) {
    const c = corners[0];
    bg = [px[c], px[c + 1], px[c + 2]];
    if (!corners.every((i) => diff(i, ...bg) <= tol)) return { x: 0, y: 0, w, h };
  }
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (px[i + 3] < 16 || (!clear && diff(i, ...bg) <= tol)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Words a logo's file name often has that aren't the brand's name. */
const NOT_A_NAME = /^(logo|logos|logotype|icon|final|copy|new|v\d+|\d+|rgb|cmyk|white|black|colou?r|dark|light|horizontal|vertical|primary|secondary|full|mark|wordmark|transparent|hd|hq|small|large|big|web|print|png|jpe?g|svg|webp)$/i;

/** A brand's name from its logo's file name ("blue-heron_logo-2024.png": "Blue heron"); "" when nothing's left. */
export function nameFromFile(file: string, max = 60): string {
  const words = file
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .split(/[\s_.\-()[\]]+/)
    .filter((w) => w && !NOT_A_NAME.test(w));
  const s = words.join(" ").trim();
  return Array.from(s ? s.charAt(0).toUpperCase() + s.slice(1) : "")
    .slice(0, max)
    .join("")
    .trim();
}

/**
 * Where a picture is kept in the team's folder: what it is, when, and a short tidy version of its own name, 80
 * characters at most after the folder (isCoverPath keeps nothing longer: a long photo name once lost its cover).
 */
export function kitUploadPath(teamId: string, kind: "cover" | "logo", fileName: string, ext: string, n = 0, now = Date.now()): string {
  const base = safeFileName(fileName).replace(/\.[a-z0-9]+$/, "").slice(0, 32).replace(/-+$/, "") || kind;
  return `${teamId}/${kind}-${now}${n ? `-${n}` : ""}-${base}.${ext.replace(/[^a-z0-9]/g, "").slice(0, 4) || "bin"}`;
}

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));

/** The logo, ready to store (null: the browser couldn't read it as a picture). */
export async function prepareLogo(file: File): Promise<File | null> {
  try {
    const src = file.type === "image/svg+xml" ? await compressImage(file, { maxWidth: 1600, maxHeight: 800, preserveAlpha: true }) : file;
    if (src.type === "image/svg+xml") return null;
    const bmp = await createImageBitmap(src);
    // Looked at no bigger than 1600 × 800 (a huge picture's margin is found as well, faster).
    const s0 = Math.min(1, 1600 / bmp.width, 800 / bmp.height);
    const a = document.createElement("canvas");
    a.width = Math.max(1, Math.round(bmp.width * s0));
    a.height = Math.max(1, Math.round(bmp.height * s0));
    const actx = a.getContext("2d", { willReadFrequently: true });
    if (!actx) return null;
    actx.imageSmoothingQuality = "high";
    actx.drawImage(bmp, 0, 0, a.width, a.height);
    bmp.close?.();
    const box = contentBox(actx.getImageData(0, 0, a.width, a.height).data, a.width, a.height);
    if (!box) return null;
    // A hair of room round what's drawn, so nothing touches the edge.
    const m = Math.max(2, Math.round(Math.max(box.w, box.h) * 0.02));
    const cx = Math.max(0, box.x - m);
    const cy = Math.max(0, box.y - m);
    const cw = Math.min(a.width - cx, box.w + 2 * m);
    const ch = Math.min(a.height - cy, box.h + 2 * m);
    const s1 = Math.min(1, 800 / cw, 400 / ch);
    const b = document.createElement("canvas");
    b.width = Math.max(1, Math.round(cw * s1));
    b.height = Math.max(1, Math.round(ch * s1));
    // Drawn in memory, not on the graphics card (made into a file straight away: no slow read back from it).
    const bctx = b.getContext("2d", { willReadFrequently: true });
    if (!bctx) return null;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(a, cx, cy, cw, ch, 0, 0, b.width, b.height);
    let blob = await canvasBlob(b, "image/webp", 0.92);
    if (!blob || blob.type !== "image/webp") blob = await canvasBlob(b, "image/png");
    if (!blob) return null;
    const ext = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], safeFileName(file.name, ext), { type: blob.type, lastModified: Date.now() });
  } catch {
    return null;
  }
}
