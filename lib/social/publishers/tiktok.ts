import { APP_NAME } from "@/lib/brand";
import "server-only";
import { PublishError, readChunk, signedVideoUrl, videoFor, type PostRow, type StepResult } from "./common";

/**
 * TikTok Direct Post with FILE_UPLOAD (we send the file; no domain
 * verification needed). Files up to 64 MB go in one piece; bigger ones in
 * 10 MB pieces, the last piece taking the remainder, as TikTok requires.
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

const FRIENDLY: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    `Until TikTok approves ${APP_NAME}, the TikTok account must be set to private (TikTok app → Settings → Privacy → Private account).`,
  privacy_level_option_mismatch: "That privacy option isn't allowed for this account right now. Pick another one.",
  spam_risk_too_many_posts: "TikTok's daily posting limit for this account was reached. It'll retry later.",
  spam_risk_user_banned_from_posting: "This TikTok account is currently blocked from posting.",
  access_token_invalid: "The TikTok sign-in expired. Reconnect TikTok in Team → Connected accounts.",
  scope_not_authorized: `${APP_NAME} doesn't have posting permission. Reconnect TikTok and allow posting.`,
  rate_limit_exceeded: "TikTok is rate limiting requests. It'll retry shortly.",
};
const RETRY = new Set(["spam_risk_too_many_posts", "rate_limit_exceeded", "internal_error"]);

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
    throw new PublishError(FRIENDLY[code] ?? `TikTok: ${body.error?.message || code}`, RETRY.has(code) || res.status >= 500);
  }
  return body.data ?? {};
}

export async function tiktokStep(post: PostRow, token: string, deadline: number): Promise<StepResult> {
  const o = post.options as TikTokOptions;
  const st = post.state as {
    publishId?: string;
    uploadUrl?: string;
    size?: number;
    chunk?: number;
    count?: number;
    index?: number;
    checks?: number;
  };

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
    const single = file.size <= SINGLE_MAX;
    const chunk = single ? file.size : CHUNK;
    const count = single ? 1 : Math.floor(file.size / CHUNK);
    const data = await tiktokCall("/post/publish/video/init/", token, {
      post_info: {
        title: (o.caption ?? "").slice(0, 2200),
        privacy_level: o.privacy,
        disable_comment: !o.allowComments || !!info.comment_disabled,
        disable_duet: !o.allowDuet || !!info.duet_disabled,
        disable_stitch: !o.allowStitch || !!info.stitch_disabled,
        brand_content_toggle: !!(o.commercial && o.brandedContent),
        brand_organic_toggle: !!(o.commercial && o.yourBrand),
      },
      source_info: { source: "FILE_UPLOAD", video_size: file.size, chunk_size: chunk, total_chunk_count: count },
    });
    if (!data.publish_id || !data.upload_url) throw new PublishError("TikTok didn't start the upload.", true);
    return {
      status: "uploading",
      step: "upload",
      progress: 0,
      state: { publishId: String(data.publish_id), uploadUrl: String(data.upload_url), size: file.size, chunk, count, index: 0 },
      externalId: String(data.publish_id),
      waitSeconds: 0,
      event: { kind: "started", message: "Upload to TikTok started" },
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
      const ids = (data.publicaly_available_post_id as (string | number)[] | undefined) ?? [];
      const isPrivate = o.privacy === "SELF_ONLY";
      return {
        status: "published",
        step: "done",
        progress: 100,
        externalId: ids[0] ? String(ids[0]) : st.publishId,
        permalink: null,
        note: isPrivate
          ? `Posted as private (only you can see it). That's expected until TikTok approves ${APP_NAME}.`
          : "Posted. Open TikTok to see it.",
        event: { kind: "published", message: isPrivate ? "Posted to TikTok (private)" : "Live on TikTok" },
      };
    }
    if (status === "FAILED") {
      throw new PublishError(`TikTok couldn't publish it${data.fail_reason ? `: ${data.fail_reason}` : ""}.`);
    }
    const checks = (st.checks ?? 0) + 1;
    if (checks > 80) throw new PublishError("TikTok is taking too long to process the video.", true);
    return { status: "processing", step: "status", progress: 100, state: { ...st, checks }, waitSeconds: 15 };
  }

  throw new PublishError(`Unknown step "${post.step}".`);
}
