/**
 * A background for your own dashboard (1.27.5), like a Steam profile's: a
 * picture, an animated GIF (or WebP / AVIF) or a short looping video, in
 * the public "dashboard-backgrounds" bucket, in your own folder (migration
 * 0092). Off by default; Settings → Preferences turns it on. Since 1.29.4
 * every file is made small in the browser first (lib/wallpaper-plan.ts,
 * lib/wallpaper-convert.ts): 2 MB at most, the bucket's limit too (0098).
 * Pure helpers, shared by the upload, the server action and the tests.
 */
import { WALL_INPUT_TYPES, WALL_MAX_BYTES } from "./wallpaper-plan";

export const DASH_BG_BUCKET = "dashboard-backgrounds";
/** What's stored, at most: the bucket's own limit too (1.29.4, 0098; 25 MB before). */
export const DASH_BG_MAX_BYTES = WALL_MAX_BYTES;
export const DASH_BG_DEFAULT_DIM = 30;
export const DASH_BG_MAX_DIM = 80;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
/** For the file picker: what we take in to make small (MOV too). */
export const DASH_BG_ACCEPT = WALL_INPUT_TYPES.join(",");

/** The extension a file of this type is stored with (null: not a kind we take). */
export const bgExtension = (type: string): string | null => TYPES[type.toLowerCase()] ?? null;

/** A picture or a video, by the stored file's name. */
export const bgKind = (path: string): "image" | "video" => (/\.(mp4|webm)$/i.test(path) ? "video" : "image");

const PATH = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9._-]{1,160}\.(jpe?g|png|webp|avif|gif|mp4|webm)$/;

/** A file in this person's own folder, of a kind we show (the database checks the same, 0092). */
export function isOwnBgPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || path.includes("..")) return false;
  const m = PATH.exec(path);
  return !!m && m[1] === userId.toLowerCase();
}

/** Where a new upload goes: "<user id>/<time>-<name>.<ext>". */
export function bgPathFor(userId: string, fileName: string, type: string, now = Date.now()): string | null {
  const ext = bgExtension(type);
  if (!ext) return null;
  const dot = fileName.lastIndexOf(".");
  const base =
    (dot > 0 ? fileName.slice(0, dot) : fileName)
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "background";
  return `${userId.toLowerCase()}/${now}-${base}.${ext}`;
}

/** 0–80 % (whole numbers); anything else is the default. */
export const clampDim = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(DASH_BG_MAX_DIM, Math.round(v))) : DASH_BG_DEFAULT_DIM);

/** Why a file can't be stored as it is (null: it can). Checked on what's about to be uploaded, after it's been made small. */
export function bgFileProblem(f: { type: string; size: number }): string | null {
  if (!bgExtension(f.type)) return "Pick a picture (JPG, PNG, WebP, AVIF), a GIF or a video (MP4, WebM).";
  if (f.size > DASH_BG_MAX_BYTES) return "Keep it under 2 MB (a shorter or smaller GIF or video).";
  return null;
}

/** An animated PNG (APNG) has an acTL chunk before its first IDAT: those stay as they are. */
export function isAnimatedPng(head: Uint8Array): boolean {
  const s = new TextDecoder("latin1").decode(head);
  const ac = s.indexOf("acTL");
  const idat = s.indexOf("IDAT");
  return ac >= 0 && (idat < 0 || ac < idat);
}
