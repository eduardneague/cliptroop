/**
 * Client-side image compression, run BEFORE uploading.
 *
 * A phone photo or a raw PNG export is often 3–10 MB; the same image as a
 * properly sized WebP is usually 100–400 KB. Every teammate then
 * downloads the small version — faster pages, faster uploads, and far
 * less of the free storage/bandwidth quota used.
 *
 * - Scales down to fit maxWidth × maxHeight (never scales UP).
 * - Encodes as WebP; if the browser can't encode WebP (older Safari),
 *   falls back to JPEG — or PNG when transparency must be kept.
 * - Animated GIFs are returned untouched (re-encoding would break the
 *   animation).
 * - SVGs become PNGs (1.31.1): an SVG can carry a script, and the picture
 *   buckets only take pictures that can't (PICTURE_TYPES).
 * - If compressing somehow makes the file bigger, the original is kept
 *   (never a JPEG: see below).
 * - What anyone may pick: lib/image/limits.ts (5 MB, a thumbnail 15 MB).
 */
export type CompressOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  /** Keep transparency (logos). Photos don't need it. */
  preserveAlpha?: boolean;
  /** Shown cropped to a square (avatars, logos): the SHORT side gets to the size, not the long one (1.31.3). */
  cover?: boolean;
};

/*
 * 1.31.3: as small as each picture can be without looking worse where it's
 * shown (the biggest it's ever shown, for a sharp phone screen):
 */
export const IMAGE_PRESETS = {
  /** YouTube shows a thumbnail at 1280×720 at most (a Short's cover: 720×1280). */
  thumbnail: { maxWidth: 1280, maxHeight: 1280, quality: 0.86 },
  /** Shown at 104 px at most (a profile), three times that on a sharp phone. */
  avatar: { maxWidth: 320, maxHeight: 320, quality: 0.82, cover: true },
  /** Shown at 64 px at most (Team). */
  logo: { maxWidth: 256, maxHeight: 256, quality: 0.86, preserveAlpha: true, cover: true },
  /** Pictures in comments, scripts and feedback: screenshots stay readable. */
  attachment: { maxWidth: 1920, maxHeight: 1920, quality: 0.8 },
} satisfies Record<string, CompressOptions>;

const SKIP_TYPES = new Set(["image/gif"]);

/**
 * What the public picture buckets take (avatars, team-logos, thumbnails,
 * script-images; migration 0103 sets the same list on them): pictures only,
 * never an SVG (it can carry a script) or a web page.
 */
export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff"] as const;
export const isPictureType = (type: string) => (PICTURE_TYPES as readonly string[]).includes(type.toLowerCase());

/**
 * What a comment attachment is stored as (1.31.14; migration 0107 gives the
 * comment-attachments bucket the same list, so it refuses anything else):
 * pictures (never an SVG), videos, sound, fonts, PDFs, text, documents,
 * spreadsheets, slides, design files and archives, each as itself; anything
 * else, a web page, an SVG or a script included, as a plain download
 * (application/octet-stream), which a browser saves instead of opening.
 * "video/*" covers every video type, and so on.
 */
export const ATTACHMENT_TYPES = [
  ...PICTURE_TYPES,
  "video/*", "audio/*", "font/*",
  "application/pdf", "text/plain", "text/csv", "text/markdown", "text/rtf", "application/rtf", "application/json", "text/vtt", "application/x-subrip",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation",
  "application/vnd.apple.pages", "application/vnd.apple.numbers", "application/vnd.apple.keynote",
  "application/postscript", "application/illustrator", "application/x-photoshop", "image/vnd.adobe.photoshop",
  "application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/vnd.rar", "application/x-rar-compressed",
  "application/gzip", "application/x-gzip", "application/x-tar",
  "application/octet-stream",
] as const;
const attachmentKind = (t: string) => (ATTACHMENT_TYPES as readonly string[]).some((a) => a === t || (a.endsWith("/*") && t.startsWith(a.slice(0, -1)) && t.length > a.length - 1));
export const storedTypeFor = (type: string) => {
  const t = (type || "").toLowerCase().split(";")[0].trim();
  return t && attachmentKind(t) ? t : "application/octet-stream";
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** A storage-safe file name: lowercase, no spaces/unicode, with the given extension. */
export function safeFileName(name: string, ext?: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    // 1.38.0: the accents NFKD splits off go (ș → s, not "s-"), as lib/feedback.ts does.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "file";
  const extension = ext ?? (dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "");
  return extension ? `${base}.${extension}` : base;
}

/** An SVG drawn as a PNG (transparency kept), as big as the preset allows; null when it can't be drawn. */
async function rasterizeSvg(file: File, opts: CompressOptions): Promise<File | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    // As a picture, an SVG never runs its scripts.
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 512;
    const h0 = img.naturalHeight || 512;
    const scale = Math.min(opts.maxWidth / w0, opts.maxHeight / h0, 4);
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/png", 1);
    return blob ? new File([blob], safeFileName(file.name, "png"), { type: "image/png", lastModified: Date.now() }) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File, opts: CompressOptions): Promise<File> {
  if (file.type === "image/svg+xml") return (await rasterizeSvg(file, opts)) ?? file;
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // format the browser can't decode (e.g. HEIC on desktop) — upload as-is
  }

  const scale = opts.cover ? Math.min(1, Math.max(opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height)) : Math.min(1, opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const quality = opts.quality ?? 0.85;
  let blob = await canvasToBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") {
    blob = opts.preserveAlpha
      ? await canvasToBlob(canvas, "image/png", 1)
      : await canvasToBlob(canvas, "image/jpeg", quality);
  }
  if (!blob) return file;

  // Nothing gained (already small and not resized): keep the original. Never for a JPEG, though: a phone
  // photo carries where it was taken (and more) in its hidden data, which only the copy drawn here leaves out.
  if (blob.size >= file.size && scale === 1 && file.type !== "image/jpeg") return file;

  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], safeFileName(file.name, ext), { type: blob.type, lastModified: Date.now() });
}

/** Long-lived browser caching for uploads — every path is unique, so it never goes stale. */
export const UPLOAD_CACHE_CONTROL = "31536000";
