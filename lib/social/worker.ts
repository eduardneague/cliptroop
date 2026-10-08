import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notify";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";
import { getAccessToken } from "./tokens";
import { ProviderError } from "./providers";
import { PublishError, type PostRow, type StepResult } from "./publishers/common";
import { youtubeStep } from "./publishers/youtube";
import { instagramStep } from "./publishers/instagram";
import { tiktokStep } from "./publishers/tiktok";

const NAME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" } as const;
/** Minutes to wait before retry 1, 2, 3, 4, 5. Then it fails. */
const BACKOFF = [1, 2, 5, 15, 30];

type Claimed = PostRow & { created_by: string | null };

async function event(postId: string, teamId: string, kind: string, message: string) {
  await createAdminClient().from("social_post_events").insert({ post_id: postId, team_id: teamId, kind, message });
}

async function notify(post: Claimed, ok: boolean, message: string) {
  const admin = createAdminClient();
  const { data: short } = await admin.from("short_videos").select("entry_number, title").eq("id", post.short_id).maybeSingle();
  const recipients = new Set<string>();
  if (post.created_by) recipients.add(post.created_by);
  if (!ok) {
    // Failures reach every master and scheduler (not just who scheduled it).
    const { data: people } = await admin
      .from("team_members")
      .select("user_id, member_roles!inner(role)")
      .eq("team_id", post.team_id)
      .eq("status", "active")
      .in("member_roles.role", ["master", "publisher"]);
    (people ?? []).forEach((m) => m.user_id && recipients.add(m.user_id as string));
  }
  const ref = short ? `#${short.entry_number} "${short.title}"` : "A short";

  // Failures also go out by email, with a link straight to the short.
  if (!ok && emailConfigured() && recipients.size) {
    const { data: profiles } = await admin.from("profiles").select("email").in("id", [...recipients]);
    const to = (profiles ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e);
    const r = await sendAlertEmail({
      to,
      subject: `${short ? `#${short.entry_number} ` : ""}couldn't post to ${NAME[post.platform]}`,
      message: `${ref} didn't post to ${NAME[post.platform]}: ${message} Open it to see the details and retry.`,
      linkText: "Open the short",
      href: `${appUrl()}/shorts/${post.short_id}`,
    });
    await event(post.id, post.team_id, "note", r.sent ? `Alert emailed to ${to.length} ${to.length === 1 ? "person" : "people"}` : "Alert email couldn't be sent");
  }
  await Promise.all(
    [...recipients].map((recipient_id) =>
      sendNotifications({
        recipient_id,
        short_id: post.short_id,
        kind: "social_post",
        metadata: { platform: post.platform, ok, message, shortNumber: short?.entry_number, shortTitle: short?.title },
        body: ok ? `${ref} is live on ${NAME[post.platform]}.` : `${ref} couldn't post to ${NAME[post.platform]}: ${message}`,
      })
    )
  );
}

/** Record the platform as posted on the short (moves it to Posted when all are done). */
async function markPosted(post: Claimed, permalink: string | null) {
  const { error } = await createAdminClient()
    .from("short_video_posts")
    .upsert({ short_id: post.short_id, platform: post.platform, post_url: permalink }, { onConflict: "short_id,platform", ignoreDuplicates: true });
  if (error) await event(post.id, post.team_id, "note", `Posted, but couldn't mark it on the short: ${error.message}`);

  // Instagram shares Reels to Facebook automatically (account setting), so
  // Facebook counts as posted too, if the short lists it. Can be undone by hand.
  if (post.platform === "instagram") {
    const admin = createAdminClient();
    const { data: short } = await admin.from("short_videos").select("platforms").eq("id", post.short_id).maybeSingle();
    if ((short?.platforms as string[] | undefined)?.includes("facebook")) {
      const { error: fb } = await admin
        .from("short_video_posts")
        .upsert({ short_id: post.short_id, platform: "facebook", post_url: null }, { onConflict: "short_id,platform", ignoreDuplicates: true });
      if (!fb) await event(post.id, post.team_id, "note", "Facebook marked as posted (shared from Instagram)");
    }
  }
}

async function save(post: Claimed, r: StepResult, keepLock: boolean) {
  const next = r.nextAt ?? new Date(Date.now() + (r.waitSeconds ?? 0) * 1000);
  await createAdminClient()
    .from("social_posts")
    .update({
      status: r.status,
      step: r.step,
      progress: r.progress ?? 0,
      ...(r.state ? { state: r.state } : {}),
      ...(r.externalId ? { external_id: r.externalId } : {}),
      ...(r.permalink !== undefined ? { permalink: r.permalink } : {}),
      ...(r.note !== undefined ? { note: r.note } : {}),
      ...(r.status === "published" ? { published_at: new Date().toISOString() } : {}),
      next_attempt_at: next.toISOString(),
      attempts: 0,
      last_error: null,
      locked_until: keepLock ? new Date(Date.now() + 3 * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id);
  if (r.event) await event(post.id, post.team_id, r.event.kind, r.event.message);
}

async function runOne(row: Claimed, deadline: number) {
  const admin = createAdminClient();
  let post = row;
  try {
    if (!post.account_id) throw new PublishError(`${NAME[post.platform]} isn't connected anymore.`);
    const { data: account } = await admin
      .from("social_accounts")
      .select("id, external_id, status")
      .eq("id", post.account_id)
      .maybeSingle();
    if (!account) throw new PublishError(`${NAME[post.platform]} isn't connected anymore.`);

    let token: string;
    try {
      token = await getAccessToken(account.id as string);
    } catch (e) {
      throw new PublishError(e instanceof ProviderError ? e.message : "Couldn't sign in to the platform.");
    }

    for (;;) {
      const r =
        post.platform === "youtube"
          ? await youtubeStep(post, token, deadline)
          : post.platform === "instagram"
            ? await instagramStep(post, token, account.external_id as string)
            : await tiktokStep(post, token, deadline);

      const continueNow = r.status !== "published" && !r.nextAt && (r.waitSeconds ?? 0) === 0 && Date.now() < deadline - 12_000;
      await save(post, r, continueNow);

      if (r.status === "published") {
        await markPosted(post, r.permalink ?? null);
        await notify(post, true, r.note ?? "");
        return;
      }
      if (!continueNow) return;
      post = {
        ...post,
        step: r.step,
        state: r.state ?? post.state,
        external_id: r.externalId ?? post.external_id,
      };
    }
  } catch (e) {
    const err = e instanceof PublishError ? e : new PublishError("Something unexpected went wrong.", true);
    const attempts = (post.attempts ?? 0) + 1;
    if (err.retry && attempts <= BACKOFF.length) {
      const wait = BACKOFF[attempts - 1];
      await admin
        .from("social_posts")
        .update({
          attempts,
          last_error: err.message,
          next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString(),
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      await event(post.id, post.team_id, "retry", `${err.message} Trying again in ${wait} min.`);
    } else {
      await admin
        .from("social_posts")
        .update({ status: "failed", attempts, last_error: err.message, locked_until: null, updated_at: new Date().toISOString() })
        .eq("id", post.id);
      await event(post.id, post.team_id, "failed", err.message);
      await notify(post, false, err.message);
    }
  }
}

/** Runs claimed posts one after another until the time is nearly up (the rest go back for the next run). */
async function runClaimed(posts: Claimed[], deadline: number) {
  const admin = createAdminClient();
  for (const post of posts) {
    if (Date.now() > deadline - 10_000) {
      // Out of time: hand it back for the next run.
      await admin.from("social_posts").update({ locked_until: null }).eq("id", post.id);
      continue;
    }
    await runOne(post, deadline);
  }
}

/**
 * Move every due post forward, within a time budget. Called every minute
 * by the Supabase timer.
 */
export async function runDuePosts(budgetMs = 45_000, source: "timer" | "manual" = "timer") {
  const started = Date.now();
  const deadline = started + budgetMs;
  const admin = createAdminClient();
  // Every run is recorded, so the Posting page can show the app is alive.
  const record = (claimed: number, error: string | null) =>
    admin.from("posting_runs").insert({ source, claimed, duration_ms: Date.now() - started, error });
  const { data, error } = await admin.rpc("claim_social_posts", { p_limit: 5 });
  if (error) {
    await record(0, error.message);
    return { claimed: 0, error: error.message };
  }
  const posts = (data ?? []) as Claimed[];
  await runClaimed(posts, deadline);
  await record(posts.length, null);
  return { claimed: posts.length };
}

/**
 * "Post now": runs exactly these posts right away (only ones that are due
 * and not already being worked on: the same lock the timer uses, so
 * nothing is ever sent twice). Whatever doesn't finish in time carries on
 * with the next timer run.
 */
export async function runPostsNow(ids: string[], budgetMs = 50_000) {
  const clean = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!clean.length) return { claimed: 0 };
  const started = Date.now();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("social_posts")
    .update({ locked_until: new Date(Date.now() + 3 * 60_000).toISOString() })
    .in("id", clean)
    .in("status", ["scheduled", "uploading", "processing", "waiting"])
    .lte("next_attempt_at", now)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .select("*");
  if (error) {
    await admin.from("posting_runs").insert({ source: "manual", claimed: 0, duration_ms: Date.now() - started, error: error.message });
    return { claimed: 0, error: error.message };
  }
  const posts = (data ?? []) as Claimed[];
  await runClaimed(posts, started + budgetMs);
  await admin.from("posting_runs").insert({ source: "manual", claimed: posts.length, duration_ms: Date.now() - started, error: null });
  return { claimed: posts.length };
}
