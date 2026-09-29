import "server-only";
import { PublishError, api, signedVideoUrl, videoFor, type PostRow, type StepResult } from "./common";

/**
 * Instagram Reels: Instagram downloads the video from a private link that
 * expires in 2 hours, processes it, then we publish it.
 */
const IG = "https://graph.instagram.com/v23.0";

type Options = { caption?: string };

export async function instagramStep(post: PostRow, token: string, igUserId: string): Promise<StepResult> {
  const o = post.options as Options;
  const st = post.state as { container?: string; checks?: number };

  if (post.step === "start") {
    const file = await videoFor(post);
    const url = await signedVideoUrl(file.path, 2 * 3600);
    const { body } = await api(`${IG}/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: url,
        caption: (o.caption ?? "").slice(0, 2200),
        share_to_feed: "true",
        access_token: token,
      }),
    });
    if (!body.id) throw new PublishError("Instagram didn't accept the video.", true);
    return {
      status: "processing",
      step: "status",
      progress: 50,
      state: { container: String(body.id), checks: 0 },
      waitSeconds: 20,
      event: { kind: "started", message: "Sent to Instagram, processing" },
    };
  }

  if (post.step === "status") {
    const { body } = await api(`${IG}/${st.container}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`);
    const code = String(body.status_code ?? "");
    if (code === "FINISHED") return { status: "processing", step: "publish", progress: 90, state: st, waitSeconds: 0 };
    if (code === "ERROR" || code === "EXPIRED") {
      throw new PublishError(`Instagram couldn't process the video${body.status ? `: ${body.status}` : ""}.`);
    }
    const checks = (st.checks ?? 0) + 1;
    if (checks > 45) throw new PublishError("Instagram is taking too long to process the video.", true);
    return { status: "processing", step: "status", progress: Math.min(89, 50 + checks * 2), state: { ...st, checks }, waitSeconds: 20 };
  }

  if (post.step === "publish") {
    const { body } = await api(`${IG}/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: String(st.container), access_token: token }),
    });
    const mediaId = String(body.id ?? "");
    if (!mediaId) throw new PublishError("Instagram didn't publish the video.", true);
    let permalink: string | null = null;
    try {
      const { body: m } = await api(`${IG}/${mediaId}?${new URLSearchParams({ fields: "permalink", access_token: token })}`);
      permalink = (m.permalink as string) ?? null;
    } catch {
      /* the post is live; the link is a nice-to-have */
    }
    return {
      status: "published",
      step: "done",
      progress: 100,
      externalId: mediaId,
      permalink,
      event: { kind: "published", message: "Live on Instagram" },
    };
  }

  throw new PublishError(`Unknown step "${post.step}".`);
}
