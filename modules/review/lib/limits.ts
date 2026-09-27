/**
 * Largest video an editor can upload, in MB. Set per environment:
 * staging (Supabase free plan) must stay at 50; production (Pro) can be
 * much higher, e.g. 2048. Also set the same limit in Supabase:
 * Storage → Settings → Global file size limit.
 */
export const MAX_VIDEO_MB = Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB) || 50);
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

/** Supabase resumable uploads require exactly 6 MB chunks. */
export const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** 74.5 → "1:14.5"; 14 → "0:14". */
export function formatTime(sec: number, precise = false) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const tenth = Math.floor((rest - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}${precise && tenth ? `.${tenth}` : ""}`;
}
