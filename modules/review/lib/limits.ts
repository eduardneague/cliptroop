/**
 * Largest video an editor can upload, in MB. Set per environment:
 * staging (Supabase free plan) must stay at 50; production (Pro) can be
 * much higher, e.g. 2048. Also set the same limit in Supabase:
 * Storage → Settings → Global file size limit.
 */
export const MAX_VIDEO_MB = Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB) || 50);
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

/**
 * Long videos (1.25.0): up to 3 GB (the "long-review-videos" bucket's own
 * limit, 0089). Set NEXT_PUBLIC_MAX_LONG_VIDEO_MB (e.g. 3072) once Supabase's
 * global file size limit allows it (Pro); until then it's the same as shorts.
 */
export const LONG_VIDEO_CAP_MB = 3072;
export const MAX_LONG_VIDEO_MB = Math.min(LONG_VIDEO_CAP_MB, Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_LONG_VIDEO_MB) || MAX_VIDEO_MB));
export const MAX_LONG_VIDEO_BYTES = MAX_LONG_VIDEO_MB * 1024 * 1024;
/** "3 GB", "50 MB". */
export const sizeLabel = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

/** Supabase resumable uploads require exactly 6 MB chunks. */
export const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** 74.5 → "1:14.5"; 14 → "0:14"; an hour or more (long videos) → "1:02:05". */
export function formatTime(sec: number, precise = false) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s - h * 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const whole = Math.floor(rest);
  const tenth = Math.floor((rest - whole) * 10);
  const mm = h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`;
  return `${mm}:${String(whole).padStart(2, "0")}${precise && tenth ? `.${tenth}` : ""}`;
}
