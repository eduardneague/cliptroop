import "server-only";
import { PublishError, readChunk, signedVideoUrl, videoFor, type PostRow, type StepResult } from "./common";

/**
 * YouTube: resumable upload in 8 MB pieces (a multiple of 256 KB, as
 * YouTube requires). If the publish time is in the future, the video is
 * uploaded as private with `publishAt`, and YouTube publishes it itself.
 */
const CHUNK = 8 * 1024 * 1024;

type Options = { title?: string; description?: string; madeForKids?: boolean; visibility?: "public" | "unlisted" | "private" };

async function readError(res: Response) {
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = j.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded") return { msg: "YouTube's daily upload limit for VPlanner was reached. It'll retry later.", retry: true };
    if (reason === "uploadLimitExceeded") return { msg: "This channel reached YouTube's upload limit for today. It'll retry later.", retry: true };
    return { msg: j.error?.message ?? `HTTP ${res.status}`, retry: res.status >= 500 || res.status === 429 };
  } catch {
    return { msg: `HTTP ${res.status}`, retry: res.status >= 500 || res.status === 429 };
  }
}

export async function youtubeStep(post: PostRow, token: string, deadline: number): Promise<StepResult> {
  const o = post.options as Options;
  const st = post.state as { session?: string; offset?: number; size?: number; checks?: number };

  if (post.step === "start") {
    const file = await videoFor(post);
    const when = new Date(post.scheduled_at);
    const future = when.getTime() > Date.now() + 5 * 60_000;
    const status: Record<string, unknown> = {
      selfDeclaredMadeForKids: !!o.madeForKids,
      ...(future ? { privacyStatus: "private", publishAt: when.toISOString() } : { privacyStatus: o.visibility ?? "public" }),
    };
    const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(file.size),
        "X-Upload-Content-Type": file.mime,
      },
      body: JSON.stringify({
        snippet: { title: (o.title ?? "").slice(0, 100), description: (o.description ?? "").slice(0, 5000), categoryId: "22" },
        status,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) throw new PublishError("Couldn't reach YouTube.", true);
    if (!res.ok) {
      const e = await readError(res);
      throw new PublishError(e.msg, e.retry);
    }
    const session = res.headers.get("location");
    if (!session) throw new PublishError("YouTube didn't start the upload.", true);
    return {
      status: "uploading",
      step: "upload",
      progress: 0,
      state: { session, offset: 0, size: file.size },
      waitSeconds: 0,
      event: { kind: "started", message: "Upload to YouTube started" },
    };
  }

  if (post.step === "upload") {
    const file = await videoFor(post);
    const size = st.size ?? file.size;
    let offset = st.offset ?? 0;
    const url = await signedVideoUrl(file.path, 3600);

    while (offset < size && Date.now() < deadline - 15_000) {
      const end = Math.min(offset + CHUNK, size) - 1;
      const chunk = await readChunk(url, offset, end);
      const res = await fetch(st.session!, {
        method: "PUT",
        headers: { "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${offset}-${end}/${size}` },
        body: chunk,
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      }).catch(() => null);
      if (!res) throw new PublishError("The upload to YouTube was interrupted.", true);

      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : end + 1;
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        // The upload session expired: start over from the beginning.
        return { status: "uploading", step: "start", progress: 0, state: {}, waitSeconds: 5, event: { kind: "retry", message: "YouTube's upload session expired, starting again" } };
      }
      if (!res.ok) {
        const e = await readError(res);
        throw new PublishError(e.msg, e.retry);
      }
      const video = (await res.json()) as { id?: string };
      if (!video.id) throw new PublishError("YouTube didn't return the video.", true);
      const when = new Date(post.scheduled_at);
      const future = when.getTime() > Date.now() + 60_000;
      return {
        status: "waiting",
        step: "check",
        progress: 100,
        state: { checks: 0 },
        externalId: video.id,
        permalink: `https://youtube.com/shorts/${video.id}`,
        nextAt: future ? new Date(when.getTime() + 2 * 60_000) : new Date(Date.now() + 60_000),
        note: future ? `Uploaded. YouTube will publish it at ${when.toISOString()}.` : "Uploaded. YouTube is processing it.",
        event: { kind: "uploaded", message: future ? "Uploaded to YouTube, scheduled there" : "Uploaded to YouTube" },
      };
    }
    return { status: "uploading", step: "upload", progress: Math.round((offset / size) * 100), state: { ...st, offset }, waitSeconds: 0 };
  }

  if (post.step === "check") {
    const id = post.external_id;
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(String(id))}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!res) throw new PublishError("Couldn't reach YouTube.", true);
    if (!res.ok) {
      const e = await readError(res);
      throw new PublishError(e.msg, e.retry);
    }
    const j = (await res.json()) as { items?: { status?: { uploadStatus?: string; privacyStatus?: string; rejectionReason?: string; failureReason?: string } }[] };
    const s = j.items?.[0]?.status;
    if (!s) throw new PublishError("The video isn't on YouTube anymore (it may have been deleted).");
    if (s.uploadStatus === "rejected" || s.uploadStatus === "failed" || s.uploadStatus === "deleted") {
      throw new PublishError(`YouTube ${s.uploadStatus} the video${s.rejectionReason || s.failureReason ? `: ${s.rejectionReason ?? s.failureReason}` : ""}.`);
    }
    if (s.uploadStatus === "processed") {
      const privateNote =
        s.privacyStatus === "private"
          ? "Uploaded, but YouTube kept it private. That's expected until Google verifies VPlanner."
          : null;
      return {
        status: "published",
        step: "done",
        progress: 100,
        // Pass the link along so the short's "posted" record gets it too.
        permalink: `https://youtube.com/shorts/${id}`,
        note: privateNote,
        event: { kind: "published", message: `Live on YouTube (${s.privacyStatus})` },
      };
    }
    const checks = (st.checks ?? 0) + 1;
    if (checks > 40) throw new PublishError("YouTube is taking unusually long to process the video.");
    return { status: "waiting", step: "check", progress: 100, state: { checks }, waitSeconds: 60 };
  }

  throw new PublishError(`Unknown step "${post.step}".`);
}
