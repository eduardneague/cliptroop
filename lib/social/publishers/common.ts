import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** What a publisher step returns. The worker saves it, then keeps going or waits. */
export type StepResult = {
  status: "uploading" | "processing" | "waiting" | "published";
  step: string;
  progress?: number;
  state?: Record<string, unknown>;
  /** Wait this long before the next step (seconds). 0 = continue right away. */
  waitSeconds?: number;
  /** Absolute time for the next step (e.g. the publish time). */
  nextAt?: Date;
  externalId?: string;
  permalink?: string | null;
  note?: string | null;
  event?: { kind: string; message: string };
};

/** A failure. `retry` = worth trying again later (network, rate limit, 5xx). */
export class PublishError extends Error {
  retry: boolean;
  constructor(message: string, retry = false) {
    super(message);
    this.retry = retry;
  }
}

export type PostRow = {
  id: string;
  team_id: string;
  short_id: string;
  platform: "youtube" | "instagram" | "tiktok" | "facebook";
  account_id: string | null;
  version_id: string | null;
  scheduled_at: string;
  step: string;
  state: Record<string, unknown>;
  options: Record<string, unknown>;
  attempts: number;
  external_id: string | null;
};

export type VideoFile = { path: string; size: number; mime: string; duration: number | null };

export async function videoFor(post: PostRow): Promise<VideoFile> {
  if (!post.version_id) throw new PublishError("No approved video to post.");
  const { data } = await createAdminClient()
    .from("short_video_versions")
    .select("storage_path, size_bytes, mime_type, duration_sec, deleted_at")
    .eq("id", post.version_id)
    .maybeSingle();
  if (!data) throw new PublishError("The video version no longer exists.");
  if (data.deleted_at) throw new PublishError("The video was cleaned up after posting.");
  return {
    path: data.storage_path as string,
    size: Number(data.size_bytes),
    mime: (data.mime_type as string) || "video/mp4",
    duration: data.duration_sec === null ? null : Number(data.duration_sec),
  };
}

/** A private link to the file (for platforms that download it themselves). */
export async function signedVideoUrl(path: string, seconds = 2 * 3600): Promise<string> {
  const { data, error } = await createAdminClient().storage.from("review-videos").createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new PublishError("Couldn't prepare the video file.", true);
  return data.signedUrl;
}

/** Read bytes [start, end] (inclusive) of the video from storage. */
export async function readChunk(url: string, start: number, end: number): Promise<ArrayBuffer> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (res.status !== 206 && res.status !== 200) throw new PublishError(`Couldn't read the video (HTTP ${res.status}).`, true);
  const buf = await res.arrayBuffer();
  // A server that ignores Range sends the whole file: cut out our part.
  if (res.status === 200 && buf.byteLength > end - start + 1) return buf.slice(start, end + 1);
  return buf;
}

/** JSON call that turns platform errors into readable, retry-aware failures. */
export async function api(url: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new PublishError("Couldn't reach the platform.", true);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = body.error as { message?: string; code?: string | number } | string | undefined;
    const msg =
      (typeof err === "object" && err?.message) ||
      (typeof err === "string" ? err : "") ||
      (body.error_description as string) ||
      `HTTP ${res.status}`;
    const retry = res.status === 429 || res.status >= 500;
    throw new PublishError(String(msg).slice(0, 400), retry);
  }
  return { body, res };
}
