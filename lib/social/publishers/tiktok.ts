import { APP_NAME } from "@/lib/brand";
import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { PULL_BUCKET, PULL_FOLDER, PULL_INIT_FALLBACK, PULL_KEEP_HOURS, PULL_STATUS_FALLBACK, isPullPath, pullPath, pullPrefix } from "@/lib/social/tiktok-pull";
import { PublishError, readChunk, signedVideoUrl, videoFor, type PostRow, type StepResult, type VideoFile } from "./common";

/**
 * TikTok Direct Post. 1.47.0: TikTok fetches the video itself (PULL_FROM_URL) from a short-lived copy at an address
 * verified for the app (lib/social/tiktok-pull.ts), as TikTok's Content Sharing Guidelines ask for files that are
 * already on our servers. Until that address is verified, or when TikTok can't fetch it, ClipTroop sends the file
 * (FILE_UPLOAD), as before: up to 64 MB in one piece, bigger ones in 10 MB pieces, the last piece taking the
 * remainder, as TikTok requires.
 */
const TT = "https://open.tiktokapis.com/v2";
const SINGLE_MAX = 64 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

export type TikTokOptions = {
  caption?: string;
  privacy?: string;
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  /** Commercial content disclosure. */
  commercial?: boolean;
  yourBrand?: boolean;
  brandedContent?: boolean;
};

/** A refusal from TikTok, with TikTok's own code (some mean "do it another way"). */
export class TikTokApiError extends PublishError {
  code: string;
  constructor(message: string, retry: boolean, code: string) {
    super(message, retry);
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts: `Until TikTok has audited ${APP_NAME}, TikTok only takes its posts on private accounts. Set the TikTok account to private (TikTok app → Settings and privacy → Privacy → Private account).`,
  privacy_level_option_mismatch: "That privacy option isn't allowed for this account right now. Pick another one.",
  // TikTok: retrying these makes them worse; the creator can post from the TikTok app.
  spam_risk_too_many_posts: "TikTok's daily posting limit for this account was reached. Post it from the TikTok app, or try again tomorrow.",
  spam_risk_user_banned_from_posting: "TikTok isn't letting this account post right now.",
  reached_active_user_cap: `TikTok's daily limit of accounts posting through ${APP_NAME} was reached. Try again tomorrow.`,
  access_token_invalid: "The TikTok sign-in expired. Reconnect TikTok in Team → Connected accounts.",
  scope_not_authorized: `${APP_NAME} doesn't have posting permission. Reconnect TikTok and allow posting.`,
  rate_limit_exceeded: "TikTok is rate limiting requests. It'll retry shortly.",
  url_ownership_unverified: `TikTok hasn't verified ${APP_NAME}'s file address for this app yet (App setup, card 6).`,
};
const RETRY = new Set(["rate_limit_exceeded", "internal_error"]);

/** Why TikTok failed a post (Get Post Status → fail_reason). */
const FAIL: Record<string, string> = {
  file_format_check_failed: "TikTok can't read this video's format. Export it as an MP4 (H.264) and upload it again.",
  duration_check_failed: "This video's length isn't allowed for this TikTok account.",
  frame_rate_check_failed: "TikTok doesn't take this video's frame rate. Export it at 23 to 60 frames a second.",
  picture_size_check_failed: "TikTok doesn't take this video's picture size.",
  video_pull_failed: "TikTok couldn't fetch the video.",
  auth_removed: "TikTok access was removed while posting. Reconnect TikTok in Team → Connected accounts.",
  spam_risk_too_many_posts: FRIENDLY.spam_risk_too_many_posts,
  spam_risk_user_banned_from_posting: FRIENDLY.spam_risk_user_banned_from_posting,
  spam_risk_text: "TikTok flagged the caption. Change it and try again.",
  spam_risk: "TikTok refused this post as risky.",
  internal: "TikTok had a problem on its side.",
  publish_cancelled: "The post was cancelled on TikTok.",
};

export async function tiktokCall(path: string, token: string, payload: unknown) {
  let res: Response;
  try {
    res = await fetch(`${TT}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new PublishError("Couldn't reach TikTok.", true);
  }
  let body: { data?: Record<string, unknown>; error?: { code?: string; message?: string } } = {};
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  const code = body.error?.code ?? (res.ok ? "ok" : `http_${res.status}`);
  if (code !== "ok") {
    throw new TikTokApiError(FRIENDLY[code] ?? `TikTok: ${body.error?.message || code}`, RETRY.has(code) || res.status >= 500, code);
  }
  return body.data ?? {};
}

/** A copy TikTok can fetch, or null: no https Supabase address, TIKTOK_UPLOAD=file, or the copy failed (0126 not run). */
async function stagePull(post: PostRow, file: VideoFile): Promise<{ path: string; url: string } | null> {
  const prefix = pullPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!prefix || process.env.TIKTOK_UPLOAD === "file") return null;
  const path = pullPath(post.id, randomUUID(), file.path, file.mime);
  try {
    const { error } = await createAdminClient().storage.from("review-videos").copy(file.path, path, { destinationBucket: PULL_BUCKET });
    return error ? null : { path, url: `${prefix}${path}` };
  } catch {
    return null;
  }
}

/** Removes a copy once TikTok has it (or gave up on it). Only ever one of ours. */
async function dropPull(path: unknown) {
  if (!isPullPath(path)) return;
  try {
    await createAdminClient().storage.from(PULL_BUCKET).remove([path]);
  } catch {
    /* the daily cleanup gets it */
  }
}

/** The daily cleanup's safety net (lib/daily-jobs.ts): copies TikTok has long finished with. How many went. */
export async function cleanupPullCopies(now = Date.now()): Promise<number> {
  const bucket = createAdminClient().storage.from(PULL_BUCKET);
  const cutoff = now - PULL_KEEP_HOURS * 3_600_000;
  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const { data, error } = await bucket.list(PULL_FOLDER, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    if (error || !data?.length) break;
    const old = data
      .map((f) => ({ path: `${PULL_FOLDER}/${f.name}`, at: Date.parse(f.created_at ?? "") }))
      .filter((f) => isPullPath(f.path) && Number.isFinite(f.at) && f.at < cutoff)
      .map((f) => f.path);
    if (!old.length) break;
    const { error: removeError } = await bucket.remove(old);
    if (removeError) break;
    removed += old.length;
    if (old.length < data.length) break;
  }
  return removed;
}

/** What the Posting card says once it's on TikTok. */
function published(privacy: string | undefined): { note: string; message: string } {
  if (privacy === "SELF_ONLY") return { note: "Posted as Only me: only you can see it on TikTok. It may take a few minutes to show on your profile.", message: "Posted to TikTok (Only me)" };
  // Unaudited apps: TikTok keeps every post private, whatever was picked (TikTok's Content Sharing Guidelines).
  if (process.env.TIKTOK_AUDITED !== "1") {
    return { note: `Posted. Until TikTok has audited ${APP_NAME}, TikTok keeps its posts private (only you can see them).`, message: "Posted to TikTok (private until TikTok's audit)" };
  }
  return { note: "Posted. It may take a few minutes to show on your profile.", message: "Live on TikTok" };
}

type TikTokState = {
  publishId?: string;
  uploadUrl?: string;
  size?: number;
  chunk?: number;
  count?: number;
  index?: number;
  checks?: number;
  /** "pull": TikTok fetches the copy at pullPath. "file": ClipTroop sends it. */
  source?: "pull" | "file";
  pullPath?: string;
  /** Send the file this time (TikTok couldn't fetch it). */
  file?: boolean;
  /** How many times TikTok failed on its side and the post started over. */
  again?: number;
};

export async function tiktokStep(post: PostRow, token: string, deadline: number): Promise<StepResult> {
  const o = post.options as TikTokOptions;
  const st = post.state as TikTokState;

  if (post.step === "start") {
    const file = await videoFor(post);
    // Re-check the account's current options right before posting.
    const info = await tiktokCall("/post/publish/creator_info/query/", token, {});
    const allowed = (info.privacy_level_options as string[] | undefined) ?? [];
    if (!o.privacy || !allowed.includes(o.privacy)) {
      throw new PublishError(FRIENDLY.privacy_level_option_mismatch);
    }
    const max = Number(info.max_video_post_duration_sec ?? 0);
    if (max && file.duration && file.duration > max) {
      throw new PublishError(`This account can post videos up to ${max} seconds; this one is ${Math.round(file.duration)}.`);
    }
    const postInfo = {
      title: (o.caption ?? "").slice(0, 2200),
      privacy_level: o.privacy,
      disable_comment: !o.allowComments || !!info.comment_disabled,
      disable_duet: !o.allowDuet || !!info.duet_disabled,
      disable_stitch: !o.allowStitch || !!info.stitch_disabled,
      brand_content_toggle: !!(o.commercial && o.brandedContent),
      brand_organic_toggle: !!(o.commercial && o.yourBrand),
    };
    const again = st.again ?? 0;
    // An earlier try's copy isn't needed any more.
    await dropPull(st.pullPath);

    let note: string | null = null;
    if (!st.file) {
      const staged = await stagePull(post, file);
      if (staged) {
        try {
          const data = await tiktokCall("/post/publish/video/init/", token, { post_info: postInfo, source_info: { source: "PULL_FROM_URL", video_url: staged.url } });
          if (!data.publish_id) throw new PublishError("TikTok didn't start the post.", true);
          return {
            status: "processing",
            step: "status",
            progress: 0,
            state: { publishId: String(data.publish_id), source: "pull", pullPath: staged.path, size: file.size, checks: 0, again } satisfies TikTokState,
            externalId: String(data.publish_id),
            waitSeconds: 10,
            event: { kind: "started", message: "Sent to TikTok: TikTok is fetching the video" },
          };
        } catch (e) {
          await dropPull(staged.path);
          if (!(e instanceof TikTokApiError && PULL_INIT_FALLBACK.includes(e.code))) throw e;
          note = `${FRIENDLY.url_ownership_unverified} ${APP_NAME} sent the file itself.`;
        }
      }
    }

    const single = file.size <= SINGLE_MAX;
    const chunk = single ? file.size : CHUNK;
    const count = single ? 1 : Math.floor(file.size / CHUNK);
    const data = await tiktokCall("/post/publish/video/init/", token, {
      post_info: postInfo,
      source_info: { source: "FILE_UPLOAD", video_size: file.size, chunk_size: chunk, total_chunk_count: count },
    });
    if (!data.publish_id || !data.upload_url) throw new PublishError("TikTok didn't start the upload.", true);
    return {
      status: "uploading",
      step: "upload",
      progress: 0,
      state: { publishId: String(data.publish_id), uploadUrl: String(data.upload_url), size: file.size, chunk, count, index: 0, source: "file", file: !!st.file, again } satisfies TikTokState,
      externalId: String(data.publish_id),
      waitSeconds: 0,
      event: { kind: "started", message: note ? `Upload to TikTok started. ${note}` : "Upload to TikTok started" },
    };
  }

  if (post.step === "upload") {
    const file = await videoFor(post);
    const url = await signedVideoUrl(file.path, 3600);
    const size = st.size!;
    const count = st.count!;
    let index = st.index ?? 0;
    while (index < count && Date.now() < deadline - 15_000) {
      const start = index * st.chunk!;
      const end = index === count - 1 ? size - 1 : start + st.chunk! - 1;
      const body = await readChunk(url, start, end);
      const res = await fetch(st.uploadUrl!, {
        method: "PUT",
        headers: {
          "Content-Type": file.mime,
          "Content-Length": String(body.byteLength),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      }).catch(() => null);
      if (!res) throw new PublishError("The upload to TikTok was interrupted.", true);
      if (res.status !== 206 && res.status !== 201 && !res.ok) {
        throw new PublishError(`TikTok rejected part of the upload (HTTP ${res.status}).`, res.status >= 500);
      }
      index++;
    }
    if (index < count) {
      return { status: "uploading", step: "upload", progress: Math.round((index / count) * 100), state: { ...st, index }, waitSeconds: 0 };
    }
    return {
      status: "processing",
      step: "status",
      progress: 100,
      state: { ...st, index, checks: 0 },
      waitSeconds: 15,
      event: { kind: "uploaded", message: "Uploaded to TikTok, processing" },
    };
  }

  if (post.step === "status") {
    const data = await tiktokCall("/post/publish/status/fetch/", token, { publish_id: st.publishId });
    const status = String(data.status ?? "");
    if (status === "PUBLISH_COMPLETE") {
      await dropPull(st.pullPath);
      const ids = (data.publicaly_available_post_id as (string | number)[] | undefined) ?? [];
      const done = published(o.privacy);
      return {
        status: "published",
        step: "done",
        progress: 100,
        externalId: ids[0] ? String(ids[0]) : st.publishId,
        permalink: null,
        note: done.note,
        event: { kind: "published", message: done.message },
      };
    }
    if (status === "FAILED") {
      await dropPull(st.pullPath);
      const reason = String(data.fail_reason ?? "");
      // TikTok couldn't download the copy: send the file instead, straight away.
      if (st.source === "pull" && PULL_STATUS_FALLBACK.includes(reason)) {
        return {
          status: "uploading",
          step: "start",
          progress: 0,
          state: { file: true, again: st.again ?? 0 } satisfies TikTokState,
          waitSeconds: 0,
          event: { kind: "note", message: `TikTok couldn't fetch the video, so ${APP_NAME} is sending it itself.` },
        };
      }
      // A problem on TikTok's side: start over (a new post on TikTok's side), twice at most.
      if (reason === "internal" && (st.again ?? 0) < 2) {
        return {
          status: "uploading",
          step: "start",
          progress: 0,
          state: { file: !!st.file, again: (st.again ?? 0) + 1 } satisfies TikTokState,
          waitSeconds: 120,
          event: { kind: "retry", message: "TikTok had a problem on its side. Trying again in 2 min." },
        };
      }
      // For good: Try again starts a new post (this one is dead on TikTok's side).
      throw new PublishError(FAIL[reason] ?? `TikTok couldn't publish it${reason ? `: ${reason}` : ""}.`, false, true);
    }
    const checks = (st.checks ?? 0) + 1;
    if (checks > 80) throw new PublishError("TikTok is taking too long to process the video.", true);
    // While TikTok fetches the copy, how much it has.
    const got = Number(data.downloaded_bytes ?? 0);
    const progress = status === "PROCESSING_DOWNLOAD" && st.size ? Math.max(1, Math.min(99, Math.round((got / st.size) * 100))) : 100;
    return { status: "processing", step: "status", progress, state: { ...st, checks }, waitSeconds: 15 };
  }

  throw new PublishError(`Unknown step "${post.step}".`);
}
