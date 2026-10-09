import { APP_NAME } from "@/lib/brand";
import "server-only";
import { FB_GRAPH } from "../providers";
import { PublishError, api, signedVideoUrl, videoFor, type PostRow, type StepResult } from "./common";

/**
 * Facebook Reels on the team's Page (Reels Publishing API, Page token).
 *
 *   start     open an upload session            → video_id
 *   upload    Facebook downloads the file from a private link (2 h). If it
 *             can't, we send the file ourselves, as a stream, resuming
 *             where it stopped (`offset` = bytes Facebook already has).
 *   uploaded  wait until Facebook has the whole file
 *   finish    publish it (video_state PUBLISHED, the caption as description)
 *   check     wait until it's live, then read its link
 *
 * Needs pages_manage_posts. Page posts are always public. Reels must be
 * 3 to 90 seconds; Facebook allows 30 API posts per Page per 24 hours.
 */

export type FacebookOptions = { caption?: string };

type State = {
  videoId?: string;
  size?: number;
  mode?: "url" | "binary";
  checks?: number;
};

type Phase = { status?: string; bytes_transfered?: number; error?: { message?: string }; errors?: { message?: string }[] };
type FbStatus = {
  video_status?: string;
  uploading_phase?: Phase;
  processing_phase?: Phase;
  publishing_phase?: Phase & { publish_status?: string };
};

const RUPLOAD = () => `https://rupload.facebook.com/video-upload/${FB_GRAPH().split("/").pop()}`;
export const FACEBOOK_MIN_SECONDS = 3;
export const FACEBOOK_MAX_SECONDS = 90;

const phaseError = (p?: Phase) => p?.error?.message || p?.errors?.find((e) => e.message)?.message || "";

async function readStatus(videoId: string, token: string): Promise<FbStatus> {
  const { body } = await api(`${FB_GRAPH()}/${videoId}?${new URLSearchParams({ fields: "status", access_token: token })}`);
  return (body.status as FbStatus | undefined) ?? {};
}

/** A rupload answer: {"success": true}, or {"debug_info": {"message", "retriable"}} / {"error": {...}}. */
async function ruploadResult(res: Response) {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  if (res.ok && body.success === true) return { ok: true as const };
  const dbg = body.debug_info as { message?: string; retriable?: boolean } | undefined;
  const err = body.error as { message?: string } | undefined;
  return {
    ok: false as const,
    message: String(dbg?.message || err?.message || `HTTP ${res.status}`).slice(0, 300),
    retry: res.status === 429 || res.status >= 500 || dbg?.retriable === true,
  };
}

function fail(prefix: string, detail: string) {
  return new PublishError(detail ? `${prefix}: ${detail.replace(/\.$/, "")}.` : `${prefix}.`);
}

/** Facebook's own wording for the usual problems, made readable. */
function friendly(e: unknown): unknown {
  if (!(e instanceof PublishError)) return e;
  const m = e.message;
  if (/pages_manage_posts|\(#200\)|permission/i.test(m)) {
    return new PublishError(`${APP_NAME} isn't allowed to post on this Page. Reconnect Facebook in Team → Connected accounts and allow managing posts.`);
  }
  if (/\(#190\)|access token|session has expired/i.test(m)) {
    return new PublishError("The Facebook sign-in stopped working. Reconnect Facebook in Team → Connected accounts.");
  }
  if (/\(#(4|17|32|613)\)|rate limit|too many/i.test(m)) {
    return new PublishError("Facebook's posting limit for this Page was reached (30 Reels a day). It'll retry later.", true);
  }
  return e;
}

export async function facebookStep(post: PostRow, token: string, pageId: string, deadline: number): Promise<StepResult> {
  try {
    return await step(post, token, pageId, deadline);
  } catch (e) {
    throw friendly(e);
  }
}

async function step(post: PostRow, token: string, pageId: string, deadline: number): Promise<StepResult> {
  const o = post.options as FacebookOptions;
  const st = post.state as State;

  if (post.step === "start") {
    const file = await videoFor(post);
    if (file.duration !== null && (file.duration < FACEBOOK_MIN_SECONDS || file.duration > FACEBOOK_MAX_SECONDS + 0.5)) {
      throw new PublishError(`Facebook Reels must be ${FACEBOOK_MIN_SECONDS} to ${FACEBOOK_MAX_SECONDS} seconds long; this video is ${Math.round(file.duration)}.`);
    }
    const { body } = await api(`${FB_GRAPH()}/${pageId}/video_reels`, {
      method: "POST",
      body: new URLSearchParams({ upload_phase: "start", access_token: token }),
    });
    if (!body.video_id) throw new PublishError("Facebook didn't start the upload.", true);
    return {
      status: "uploading",
      step: "upload",
      progress: 0,
      state: { videoId: String(body.video_id), size: file.size, mode: "url", checks: 0 },
      externalId: String(body.video_id),
      waitSeconds: 0,
      event: { kind: "started", message: "Upload to Facebook started" },
    };
  }

  if (post.step === "upload") {
    const file = await videoFor(post);
    const videoId = st.videoId!;
    const size = st.size ?? file.size;

    // 1. Facebook fetches the file from a private link.
    if ((st.mode ?? "url") === "url") {
      const url = await signedVideoUrl(file.path, 2 * 3600);
      let res: Response | null = null;
      try {
        res = await fetch(`${RUPLOAD()}/${videoId}`, {
          method: "POST",
          headers: { Authorization: `OAuth ${token}`, file_url: url },
          cache: "no-store",
          signal: AbortSignal.timeout(Math.max(10_000, Math.min(60_000, deadline - Date.now() - 12_000))),
        });
      } catch {
        // Timed out: Facebook may still be fetching it. The status check tells.
        return { status: "uploading", step: "uploaded", progress: 10, state: { ...st, checks: 0 }, waitSeconds: 10 };
      }
      const r = await ruploadResult(res);
      if (r.ok) {
        return { status: "uploading", step: "uploaded", progress: 50, state: { ...st, checks: 0 }, waitSeconds: 3 };
      }
      if (r.retry) throw new PublishError(`Facebook couldn't take the video right now: ${r.message}`, true);
      // Facebook couldn't download it (e.g. the link was refused): send it ourselves.
      return {
        status: "uploading",
        step: "upload",
        progress: 0,
        state: { ...st, mode: "binary", checks: 0 },
        waitSeconds: 0,
        event: { kind: "note", message: "Facebook couldn't fetch the file, sending it directly" },
      };
    }

    // 2. We send the file, from wherever Facebook got to.
    const now = await readStatus(videoId, token);
    if (now.uploading_phase?.status === "complete") {
      return { status: "uploading", step: "uploaded", progress: 100, state: { ...st, checks: 0 }, waitSeconds: 0 };
    }
    const offset = Math.max(0, Math.min(size, Number(now.uploading_phase?.bytes_transfered ?? 0)));
    const url = await signedVideoUrl(file.path, 3600);
    const src = await fetch(url, {
      headers: offset ? { Range: `bytes=${offset}-` } : {},
      cache: "no-store",
    }).catch(() => null);
    if (!src || !src.body || (src.status !== 200 && src.status !== 206)) {
      throw new PublishError("Couldn't read the video to send it to Facebook.", true);
    }
    if (offset && src.status === 200) {
      // Storage ignored the range: start over from the first byte isn't
      // possible mid-session, so retry later.
      throw new PublishError("Couldn't resume the upload to Facebook.", true);
    }
    // Stop a little before this run's time is up; the next run resumes.
    const budget = deadline - Date.now() - 12_000;
    if (budget < 5_000) return { status: "uploading", step: "upload", progress: Math.round((offset / size) * 100), state: st, waitSeconds: 0 };
    let res: Response | null = null;
    try {
      res = await fetch(`${RUPLOAD()}/${videoId}`, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          offset: String(offset),
          file_size: String(size),
          "Content-Type": "application/octet-stream",
        },
        body: src.body,
        // Streams the file through without holding it in memory.
        duplex: "half",
        cache: "no-store",
        signal: AbortSignal.timeout(budget),
      } as RequestInit & { duplex: "half" });
    } catch {
      res = null;
    }
    if (!res) {
      // Cut off (time's up or the connection dropped): carry on from where Facebook got to.
      const after = await readStatus(videoId, token).catch(() => ({}) as FbStatus);
      const got = Number(after.uploading_phase?.bytes_transfered ?? offset);
      return { status: "uploading", step: "upload", progress: Math.min(99, Math.round((got / size) * 100)), state: st, waitSeconds: 0 };
    }
    const r = await ruploadResult(res);
    if (!r.ok) throw new PublishError(`Facebook didn't accept the upload: ${r.message}`, r.retry);
    return { status: "uploading", step: "uploaded", progress: 100, state: { ...st, checks: 0 }, waitSeconds: 3 };
  }

  if (post.step === "uploaded") {
    const s = await readStatus(st.videoId!, token);
    const problem = phaseError(s.processing_phase) || phaseError(s.uploading_phase);
    if (problem || s.uploading_phase?.status === "error" || s.processing_phase?.status === "error") {
      throw fail("Facebook couldn't use the video", problem);
    }
    if (s.uploading_phase?.status === "complete") {
      return { status: "uploading", step: "finish", progress: 100, state: { ...st, checks: 0 }, waitSeconds: 0, event: { kind: "uploaded", message: "Uploaded to Facebook" } };
    }
    const checks = (st.checks ?? 0) + 1;
    const got = Number(s.uploading_phase?.bytes_transfered ?? 0);
    // Facebook fetching the link reports nothing until it's done: show it's under way.
    const progress = st.size && got ? Math.min(99, Math.round((got / st.size) * 100)) : 10;
    if (checks > 30) {
      // 5 minutes and Facebook still hasn't fetched it: send it ourselves.
      if ((st.mode ?? "url") === "url") {
        return {
          status: "uploading",
          step: "upload",
          progress,
          state: { ...st, mode: "binary", checks: 0 },
          waitSeconds: 0,
          event: { kind: "note", message: "Facebook was slow to fetch the file, sending it directly" },
        };
      }
      throw new PublishError("The upload to Facebook stalled.", true);
    }
    return { status: "uploading", step: "uploaded", progress, state: { ...st, checks }, waitSeconds: 10 };
  }

  if (post.step === "finish") {
    const { body } = await api(`${FB_GRAPH()}/${pageId}/video_reels`, {
      method: "POST",
      body: new URLSearchParams({
        upload_phase: "finish",
        video_id: st.videoId!,
        video_state: "PUBLISHED",
        description: (o.caption ?? "").slice(0, 5000),
        access_token: token,
      }),
    });
    if (body.success !== true) throw new PublishError("Facebook didn't publish the Reel.", true);
    return { status: "processing", step: "check", progress: 100, state: { ...st, checks: 0 }, waitSeconds: 10 };
  }

  if (post.step === "check") {
    const s = await readStatus(st.videoId!, token);
    const problem = phaseError(s.processing_phase) || phaseError(s.publishing_phase);
    if (problem || s.processing_phase?.status === "error" || s.publishing_phase?.status === "error" || s.video_status === "error") {
      throw fail("Facebook couldn't publish the Reel", problem);
    }
    const live = s.publishing_phase?.status === "complete" || s.publishing_phase?.publish_status === "published";
    if (!live) {
      const checks = (st.checks ?? 0) + 1;
      if (checks > 90) throw new PublishError("Facebook is taking too long to publish the Reel.", true);
      return { status: "processing", step: "check", progress: 100, state: { ...st, checks }, waitSeconds: 20 };
    }
    let permalink = `https://www.facebook.com/reel/${st.videoId}`;
    try {
      const { body: v } = await api(`${FB_GRAPH()}/${st.videoId}?${new URLSearchParams({ fields: "permalink_url", access_token: token })}`);
      const p = typeof v.permalink_url === "string" ? v.permalink_url : "";
      if (p) permalink = p.startsWith("http") ? p : `https://www.facebook.com${p.startsWith("/") ? "" : "/"}${p}`;
    } catch {
      /* the Reel is live; the /reel/ link works too */
    }
    return {
      status: "published",
      step: "done",
      progress: 100,
      externalId: st.videoId,
      permalink,
      note: "Posted publicly to your Page as a Reel.",
      event: { kind: "published", message: "Live on Facebook" },
    };
  }

  throw new PublishError(`Unknown step "${post.step}".`);
}
