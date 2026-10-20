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
 * - Animated GIFs and SVGs are returned untouched (re-encoding would
 *   break the animation / vector).
 * - If compressing somehow makes the file bigger, the original is kept.
 */
export type CompressOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  /** Keep transparency (logos). Photos don't need it. */
  preserveAlpha?: boolean;
};

export const IMAGE_PRESETS = {
  /** YouTube thumbnails are 1280×720; keep headroom for crisp previews. */
  thumbnail: { maxWidth: 1920, maxHeight: 1080, quality: 0.88 },
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.85 },
  logo: { maxWidth: 512, maxHeight: 512, quality: 0.9, preserveAlpha: true },
  /** Images attached to notes — readable, not archival. */
  attachment: { maxWidth: 2400, maxHeight: 2400, quality: 0.85 },
  /** A dashboard background (1.27.5): sharp on a big screen. */
  background: { maxWidth: 3840, maxHeight: 2400, quality: 0.86 },
} satisfies Record<string, CompressOptions>;

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]);

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** A storage-safe file name: lowercase, no spaces/unicode, with the given extension. */
export function safeFileName(name: string, ext?: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "file";
  const extension = ext ?? (dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "");
  return extension ? `${base}.${extension}` : base;
}

export async function compressImage(file: File, opts: CompressOptions): Promise<File> {
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // format the browser can't decode (e.g. HEIC on desktop) — upload as-is
  }

  const scale = Math.min(1, opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height);
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

  // Nothing gained (already small and not resized) — keep the original.
  if (blob.size >= file.size && scale === 1) return file;

  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], safeFileName(file.name, ext), { type: blob.type, lastModified: Date.now() });
}

/** Long-lived browser caching for uploads — every path is unique, so it never goes stale. */
export const UPLOAD_CACHE_CONTROL = "31536000";
