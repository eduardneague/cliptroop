/*
 * TikTok fetches the video itself (1.47.0, PULL_FROM_URL). TikTok's Content Sharing Guidelines: "If video resources
 * are already on API Clients' servers, do not use FILE_UPLOAD; use PULL_FROM_URL instead", from an address TikTok has
 * verified for the app (TikTok for Developers → the app → URL properties → URL prefix). The approved video stays in
 * the private review-videos bucket; for the few minutes TikTok needs, a copy sits in the public tiktok-pull bucket
 * (migration 0126) under a random name nobody can list, and goes once TikTok has it. Until the address is verified (or
 * when TikTok can't fetch it), ClipTroop sends the file itself, as before. Pure: the server side is in
 * lib/social/publishers/tiktok.ts, the owner's steps on /setup (card 6).
 */

export const PULL_BUCKET = "tiktok-pull";
/** Copies live in this folder; the bucket's root holds TikTok's verification file (never removed). */
export const PULL_FOLDER = "v";
/** The daily cleanup removes copies older than this (TikTok gives up on a download after an hour). */
export const PULL_KEEP_HOURS = 6;

/** TikTok's answer to the post's start that means "that address isn't verified for this app": send the file instead. */
export const PULL_INIT_FALLBACK: readonly string[] = ["url_ownership_unverified"];
/** TikTok's reason for a failed post that means "couldn't download it": send the file instead. */
export const PULL_STATUS_FALLBACK: readonly string[] = ["video_pull_failed"];

/** The URL prefix to verify in TikTok, from the Supabase project's address; null when it isn't a plain https origin. */
export function pullPrefix(supabaseUrl: string | null | undefined): string | null {
  const b = String(supabaseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(b)) return null;
  return `${b}/storage/v1/object/public/${PULL_BUCKET}/`;
}

/** A copy's name: the folder, the post, a random part, and the file's own kind of video. */
export function pullPath(postId: string, random: string, sourcePath: string, mime: string): string {
  const fromName = /\.(mp4|mov|webm)$/i.exec(sourcePath)?.[1]?.toLowerCase();
  const ext = fromName ?? (mime === "video/quicktime" ? "mov" : mime === "video/webm" ? "webm" : "mp4");
  const safe = (v: string) => v.replace(/[^a-z0-9-]/gi, "").slice(0, 64);
  return `${PULL_FOLDER}/${safe(postId)}-${safe(random)}.${ext}`;
}

/** Whether a stored copy's name is one of ours (so removing it can't touch anything else). */
const PULL_NAME = new RegExp(`^${PULL_FOLDER}/[a-z0-9-]{1,64}-[a-z0-9-]{1,64}\\.(mp4|mov|webm)$`, "i");
export function isPullPath(v: unknown): v is string {
  return typeof v === "string" && PULL_NAME.test(v);
}
