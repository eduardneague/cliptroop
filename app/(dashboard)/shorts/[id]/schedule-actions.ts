"use server";

import { APP_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getAccessToken } from "@/lib/social/tokens";
import { tiktokCall, type TikTokOptions } from "@/lib/social/publishers/tiktok";
import { PublishError } from "@/lib/social/publishers/common";
import { runDuePosts } from "@/lib/social/worker";
import { YOUTUBE_EDIT_SCOPE } from "@/lib/social/providers";

type Result<T = object> = ({ error?: undefined } & T) | { error: string; reconnect?: boolean };

/** Posts must be at least this far ahead, so there's always time to change them. */
const MIN_LEAD_MINUTES = 15;
type Platform = "youtube" | "instagram" | "tiktok";
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function manager(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, ok: false };
  const roles = (await getMembership(supabase, teamId))?.roles ?? [];
  return { user, ok: isMaster(roles) || roles.includes("publisher") };
}

export type CreatorInfo = {
  nickname: string;
  avatarUrl: string | null;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec: number | null;
};

/** TikTok's live account info (the posting screen must show it). */
export async function getTikTokCreatorInfo(teamId: string): Promise<Result<{ info: CreatorInfo }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const m = await manager(teamId);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can post." };
  const { data: account } = await createAdminClient()
    .from("social_accounts")
    .select("id")
    .eq("team_id", teamId)
    .eq("platform", "tiktok")
    .maybeSingle();
  if (!account) return { error: "TikTok isn't connected." };
  try {
    const token = await getAccessToken(account.id as string);
    const d = await tiktokCall("/post/publish/creator_info/query/", token, {});
    return {
      info: {
        nickname: String(d.creator_nickname ?? d.creator_username ?? "TikTok account"),
        avatarUrl: (d.creator_avatar_url as string) ?? null,
        privacyOptions: (d.privacy_level_options as string[]) ?? [],
        commentDisabled: !!d.comment_disabled,
        duetDisabled: !!d.duet_disabled,
        stitchDisabled: !!d.stitch_disabled,
        maxDurationSec: d.max_video_post_duration_sec ? Number(d.max_video_post_duration_sec) : null,
      },
    };
  } catch (e) {
    return { error: e instanceof PublishError || e instanceof Error ? e.message : "Couldn't reach TikTok." };
  }
}

export type ScheduleEntry =
  | { platform: "youtube"; at: string; options: { title: string; description: string; madeForKids: boolean | null; visibility: "public" | "unlisted" | "private" } }
  | { platform: "instagram"; at: string; options: { caption: string } }
  | { platform: "tiktok"; at: string; options: TikTokOptions };

/** Schedule (or reschedule) posts for an approved short. */
export async function schedulePosts(shortId: string, entries: ScheduleEntry[]): Promise<Result<{ scheduled: number }>> {
  if (!UUID.test(shortId)) return { error: "Short not found." };
  if (!Array.isArray(entries) || entries.length === 0) return { error: "Pick at least one platform." };
  const admin = createAdminClient();
  const supabase = await createClient();

  // Read through the user's own access first: proves they can see it.
  const { data: short } = await supabase
    .from("short_videos")
    .select("id, team_id, stage, platforms, approved_version_id")
    .eq("id", shortId)
    .maybeSingle();
  if (!short) return { error: "Short not found." };
  const m = await manager(short.team_id as string);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can schedule posts." };
  if (short.stage !== "ready" && short.stage !== "posted") return { error: "Approve the short before scheduling it." };

  let versionId = (short.approved_version_id as string | null) ?? null;
  if (!versionId) {
    const { data: v } = await admin
      .from("short_video_versions")
      .select("id")
      .eq("short_id", shortId)
      .is("deleted_at", null)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionId = (v?.id as string | undefined) ?? null;
  }
  if (!versionId) return { error: "There's no uploaded video to post." };

  const { data: accounts } = await admin
    .from("social_accounts")
    .select("id, platform, status")
    .eq("team_id", short.team_id);

  const seen = new Set<string>();
  const clean: { platform: Platform; at: Date; options: Record<string, unknown>; accountId: string }[] = [];
  for (const e of entries) {
    if (!["youtube", "instagram", "tiktok"].includes(e.platform) || seen.has(e.platform)) return { error: "Invalid platform list." };
    seen.add(e.platform);
    if (!(short.platforms as string[]).includes(e.platform)) return { error: `This short isn't planned for ${NAME[e.platform]}.` };
    const account = (accounts ?? []).find((a) => a.platform === e.platform);
    if (!account) return { error: `${NAME[e.platform]} isn't connected. Connect it in Team → Connected accounts.` };
    if (account.status !== "active") return { error: `${NAME[e.platform]} needs reconnecting first.` };
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) return { error: `Pick a valid time for ${NAME[e.platform]}.` };
    if (at.getTime() > Date.now() + 180 * 86_400_000) return { error: "Schedule within the next 6 months." };
    if (at.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
      return { error: `Pick a time at least ${MIN_LEAD_MINUTES} minutes from now for ${NAME[e.platform]}.` };
    }

    if (e.platform === "youtube") {
      const o = e.options;
      const title = String(o.title ?? "").trim();
      if (!title) return { error: "YouTube needs a title." };
      if (title.length > 100) return { error: "YouTube titles can be up to 100 characters." };
      if (/[<>]/.test(title)) return { error: "YouTube titles can't contain < or >." };
      if (String(o.description ?? "").length > 5000) return { error: "YouTube descriptions can be up to 5,000 characters." };
      if (typeof o.madeForKids !== "boolean") return { error: "Choose whether the YouTube video is made for kids." };
      if (!["public", "unlisted", "private"].includes(o.visibility)) return { error: "Pick the YouTube visibility." };
      clean.push({ platform: "youtube", at, accountId: account.id as string, options: { title, description: String(o.description ?? ""), madeForKids: o.madeForKids, visibility: o.visibility } });
    } else if (e.platform === "instagram") {
      const caption = String(e.options.caption ?? "");
      if (caption.length > 2200) return { error: "Instagram captions can be up to 2,200 characters." };
      clean.push({ platform: "instagram", at, accountId: account.id as string, options: { caption } });
    } else {
      const o = e.options;
      if (!o.privacy) return { error: "Choose who can see the TikTok post." };
      if (String(o.caption ?? "").length > 2200) return { error: "TikTok captions can be up to 2,200 characters." };
      if (o.commercial && !o.yourBrand && !o.brandedContent) {
        return { error: "For commercial content, tick \"Your brand\", \"Branded content\" or both." };
      }
      if (o.commercial && o.brandedContent && o.privacy === "SELF_ONLY") {
        return { error: "Branded content can't be private on TikTok. Pick another privacy option." };
      }
      clean.push({
        platform: "tiktok",
        at,
        accountId: account.id as string,
        options: {
          caption: String(o.caption ?? ""),
          privacy: o.privacy,
          allowComments: !!o.allowComments,
          allowDuet: !!o.allowDuet,
          allowStitch: !!o.allowStitch,
          commercial: !!o.commercial,
          yourBrand: !!(o.commercial && o.yourBrand),
          brandedContent: !!(o.commercial && o.brandedContent),
        },
      });
    }
  }

  const { data: existing } = await admin
    .from("social_posts")
    .select("id, platform, status")
    .eq("short_id", shortId)
    .neq("status", "cancelled");

  for (const c of clean) {
    const prev = (existing ?? []).find((p) => p.platform === c.platform);
    if (prev && !["scheduled", "failed"].includes(prev.status as string)) {
      return { error: `${NAME[c.platform]} is already ${prev.status === "published" ? "posted" : "in progress"}.` };
    }
  }

  for (const c of clean) {
    const prev = (existing ?? []).find((p) => p.platform === c.platform);
    // YouTube uploads right away (YouTube publishes at the time itself);
    // Instagram and TikTok start at the chosen time.
    const nextAt = c.platform === "youtube" ? new Date() : c.at;
    const values = {
      team_id: short.team_id,
      short_id: shortId,
      platform: c.platform,
      account_id: c.accountId,
      version_id: versionId,
      scheduled_at: c.at.toISOString(),
      status: "scheduled",
      step: "start",
      progress: 0,
      attempts: 0,
      next_attempt_at: nextAt.toISOString(),
      locked_until: null,
      last_error: null,
      external_id: null,
      permalink: null,
      note: null,
      options: c.options,
      state: {},
      created_by: m.user.id,
      updated_at: new Date().toISOString(),
    };
    const q = prev
      ? admin.from("social_posts").update(values).eq("id", prev.id).select("id").single()
      : admin.from("social_posts").insert(values).select("id").single();
    const { data: row, error } = await q;
    if (error || !row) return { error: `Couldn't schedule ${NAME[c.platform]}. Try again.` };
    await admin.from("social_post_events").insert({
      post_id: row.id,
      team_id: short.team_id,
      kind: prev ? "rescheduled" : "scheduled",
      message: `Scheduled for ${c.at.toISOString()}`,
      actor_id: m.user.id,
    });
  }

  revalidatePath(`/shorts/${shortId}`);
  return { scheduled: clean.length };
}

async function loadPost(postId: string) {
  if (!UUID.test(postId)) return null;
  const supabase = await createClient();
  // Through the user's own access: proves they can see it.
  const { data } = await supabase.from("social_posts").select("id, team_id, short_id, platform, status, external_id").eq("id", postId).maybeSingle();
  return data;
}

export async function cancelPost(postId: string): Promise<Result> {
  const post = await loadPost(postId);
  if (!post) return { error: "Post not found." };
  const m = await manager(post.team_id as string);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can cancel posts." };
  const admin = createAdminClient();
  let message = "Cancelled";
  if (post.platform === "youtube" && post.external_id) {
    // Uploaded and scheduled on YouTube: delete it there, before it goes live.
    if (post.status !== "waiting") return { error: "It's already live on YouTube, so it can't be cancelled here." };
    const yt = await youtubeAccess(post.team_id as string);
    if ("error" in yt) return { error: yt.error, reconnect: yt.reconnect };
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(post.external_id as string)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${yt.token}` },
      cache: "no-store",
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) return { error: "YouTube didn't delete the video. Try again, or delete it in YouTube Studio." };
    message = "Cancelled and deleted from YouTube";
  } else if (!["scheduled", "failed"].includes(post.status as string)) {
    return { error: "It's being posted right now and can't be cancelled." };
  }
  await admin.from("social_posts").update({ status: "cancelled", locked_until: null, updated_at: new Date().toISOString() }).eq("id", postId);
  await admin.from("social_post_events").insert({ post_id: postId, team_id: post.team_id, kind: "cancelled", message, actor_id: m.user.id });
  revalidatePath(`/shorts/${post.short_id}`);
  return {};
}

export async function retryPost(postId: string): Promise<Result> {
  const post = await loadPost(postId);
  if (!post) return { error: "Post not found." };
  const m = await manager(post.team_id as string);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can retry posts." };
  if (post.status !== "failed") return { error: "Only failed posts can be retried." };
  const admin = createAdminClient();
  await admin
    .from("social_posts")
    .update({ status: "scheduled", attempts: 0, last_error: null, next_attempt_at: new Date().toISOString(), locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "failed");
  await admin.from("social_post_events").insert({ post_id: postId, team_id: post.team_id, kind: "retry", message: "Retry requested", actor_id: m.user.id });
  revalidatePath(`/shorts/${post.short_id}`);
  return {};
}

/** Testing only: process due posts now instead of waiting for the timer. */
export async function runDuePostsNow(shortId: string): Promise<Result<{ claimed: number }>> {
  if (process.env.VERCEL_ENV === "production") return { error: "Not available on production." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const r = await runDuePosts(50_000, "manual");
  if (UUID.test(shortId)) revalidatePath(`/shorts/${shortId}`);
  revalidatePath("/posting");
  return { claimed: r.claimed ?? 0 };
}


export type Preflight = { platform: Platform; ok: boolean; message: string };

/**
 * Live checks right before scheduling, one per platform: the sign-in
 * works, the account is the right kind, TikTok's options allow it, and
 * the video file is there. Nothing is scheduled if any check fails.
 */
export async function checkBeforeScheduling(shortId: string, platforms: Platform[]): Promise<Result<{ checks: Preflight[] }>> {
  if (!UUID.test(shortId)) return { error: "Short not found." };
  const supabase = await createClient();
  const { data: short } = await supabase.from("short_videos").select("id, team_id, approved_version_id").eq("id", shortId).maybeSingle();
  if (!short) return { error: "Short not found." };
  const m = await manager(short.team_id as string);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can schedule posts." };

  const admin = createAdminClient();
  const versionQuery = short.approved_version_id
    ? admin.from("short_video_versions").select("storage_path, size_bytes, duration_sec, deleted_at").eq("id", short.approved_version_id).maybeSingle()
    : admin.from("short_video_versions").select("storage_path, size_bytes, duration_sec, deleted_at").eq("short_id", shortId).is("deleted_at", null).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const { data: version } = await versionQuery;
  let fileOk = !!version && !version.deleted_at;
  if (fileOk) {
    const { data: signed } = await admin.storage.from("review-videos").createSignedUrl(version!.storage_path as string, 60);
    const head = signed?.signedUrl ? await fetch(signed.signedUrl, { method: "HEAD", cache: "no-store" }).catch(() => null) : null;
    fileOk = !!head?.ok;
  }
  const duration = version?.duration_sec === null || version?.duration_sec === undefined ? null : Number(version.duration_sec);
  const { data: accounts } = await admin.from("social_accounts").select("id, platform, status").eq("team_id", short.team_id);

  const checks = await Promise.all(
    platforms.map(async (platform): Promise<Preflight> => {
      if (!fileOk) return { platform, ok: false, message: "The video file is missing. Upload the video again." };
      const account = (accounts ?? []).find((a) => a.platform === platform);
      if (!account) return { platform, ok: false, message: "Not connected. Connect it in Team → Connected accounts." };
      if (account.status !== "active") return { platform, ok: false, message: "Needs reconnecting in Team → Connected accounts." };
      try {
        const token = await getAccessToken(account.id as string);
        if (platform === "youtube") {
          const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!r.ok) return { platform, ok: false, message: `YouTube refused the sign-in (HTTP ${r.status}). Reconnect YouTube.` };
          return { platform, ok: true, message: "Signed in. It uploads right away and YouTube publishes it at your time." };
        }
        if (platform === "instagram") {
          const r = await fetch(`https://graph.instagram.com/v23.0/me?fields=account_type,username&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
          const j = (await r.json().catch(() => ({}))) as { account_type?: string; username?: string };
          if (!r.ok) return { platform, ok: false, message: "Instagram refused the sign-in. Reconnect Instagram." };
          if (j.account_type && !/business|creator/i.test(j.account_type)) return { platform, ok: false, message: "The Instagram account must be Professional (Business or Creator)." };
          return { platform, ok: true, message: `Signed in as @${j.username ?? "account"}. ${APP_NAME} sends it at your time.` };
        }
        const d = await tiktokCall("/post/publish/creator_info/query/", token, {});
        const max = Number(d.max_video_post_duration_sec ?? 0);
        if (max && duration && duration > max) return { platform, ok: false, message: `This account can post up to ${max}s; the video is ${Math.round(duration)}s.` };
        return { platform, ok: true, message: `Signed in as ${String(d.creator_nickname ?? "account")}. ${APP_NAME} sends it at your time.` };
      } catch (e) {
        return { platform, ok: false, message: e instanceof Error ? e.message : "Couldn't check this account." };
      }
    })
  );
  return { checks };
}


/** A YouTube token that may edit videos (needs the newer permission). */
async function youtubeAccess(teamId: string): Promise<{ token: string } | { error: string; reconnect?: boolean }> {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("social_accounts").select("id, scopes").eq("team_id", teamId).eq("platform", "youtube").maybeSingle();
  if (!acc) return { error: "YouTube isn't connected." };
  if (!((acc.scopes as string[]) ?? []).includes(YOUTUBE_EDIT_SCOPE)) {
    return { error: "YouTube needs one more permission to change scheduled videos.", reconnect: true };
  }
  try {
    return { token: await getAccessToken(acc.id as string) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't sign in to YouTube." };
  }
}

/**
 * Change when a post goes live. Instagram/TikTok: any time before they're
 * sent. YouTube: before upload, or after upload while it's still
 * scheduled on YouTube (changed there directly).
 */
export async function changePostTime(postId: string, atIso: string): Promise<Result> {
  if (!UUID.test(postId)) return { error: "Post not found." };
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime())) return { error: "Pick a valid time." };
  if (at.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) return { error: `Pick a time at least ${MIN_LEAD_MINUTES} minutes from now.` };
  if (at.getTime() > Date.now() + 180 * 86_400_000) return { error: "Schedule within the next 6 months." };

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("social_posts")
    .select("id, team_id, short_id, platform, status, step, external_id, options")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found." };
  const m = await manager(post.team_id as string);
  if (!m.user) return { error: "Your session expired. Sign in again." };
  if (!m.ok) return { error: "Only the master or a scheduler can change the time." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (post.status === "published") return { error: "It's already published." };

  if (post.platform === "youtube" && post.external_id) {
    if (post.status !== "waiting") return { error: "It's being processed right now. Try again in a minute." };
    const yt = await youtubeAccess(post.team_id as string);
    if ("error" in yt) return { error: yt.error, reconnect: yt.reconnect };
    const o = (post.options ?? {}) as { madeForKids?: boolean };
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: { Authorization: `Bearer ${yt.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: post.external_id,
        status: { privacyStatus: "private", publishAt: at.toISOString(), selfDeclaredMadeForKids: !!o.madeForKids },
      }),
      cache: "no-store",
    }).catch(() => null);
    if (!res || !res.ok) {
      const j = res ? ((await res.json().catch(() => ({}))) as { error?: { message?: string } }) : {};
      return { error: `YouTube didn't accept the new time${j.error?.message ? `: ${j.error.message}` : "."}` };
    }
    await admin
      .from("social_posts")
      .update({ scheduled_at: at.toISOString(), next_attempt_at: new Date(at.getTime() + 2 * 60_000).toISOString(), note: `Scheduled on YouTube for ${at.toISOString()}.`, updated_at: now })
      .eq("id", postId);
  } else {
    if (post.status === "uploading" || post.status === "processing") return { error: "It's being posted right now." };
    if (!["scheduled", "failed"].includes(post.status as string)) return { error: "This post can't be moved now." };
    await admin
      .from("social_posts")
      .update({
        scheduled_at: at.toISOString(),
        // YouTube uploads straight away; the others wait for the new time.
        next_attempt_at: post.platform === "youtube" ? now : at.toISOString(),
        status: "scheduled",
        attempts: 0,
        last_error: null,
        updated_at: now,
      })
      .eq("id", postId);
  }
  await admin.from("social_post_events").insert({
    post_id: postId,
    team_id: post.team_id,
    kind: "rescheduled",
    message: `Time changed to ${at.toISOString()}`,
    actor_id: m.user.id,
  });
  revalidatePath(`/shorts/${post.short_id}`);
  revalidatePath("/posting");
  return {};
}

/** Just the posting status of one short (for light live updates). */
export async function getPostingState(shortId: string) {
  if (!UUID.test(shortId)) return { posts: [], events: [] };
  const supabase = await createClient();
  const [{ data: posts }, { data: events }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id, platform, status, step, progress, scheduled_at, last_error, attempts, next_attempt_at, permalink, note, external_id, options")
      .eq("short_id", shortId)
      .neq("status", "cancelled"),
    supabase
      .from("social_post_events")
      .select("id, post_id, kind, message, created_at, social_posts!inner(short_id)")
      .eq("social_posts.short_id", shortId)
      .order("created_at", { ascending: true }),
  ]);
  return {
    posts: (posts ?? []).map((p) => ({
      id: p.id as string,
      platform: p.platform as Platform,
      status: p.status as string,
      step: (p.step as string) ?? undefined,
      progress: (p.progress as number) ?? 0,
      scheduledAt: p.scheduled_at as string,
      lastError: (p.last_error as string | null) ?? null,
      attempts: (p.attempts as number) ?? 0,
      nextAttemptAt: p.next_attempt_at as string,
      permalink: (p.permalink as string | null) ?? null,
      note: (p.note as string | null) ?? null,
      externalId: (p.external_id as string | null) ?? null,
      options: (p.options as Record<string, unknown>) ?? {},
    })),
    events: (events ?? []).map((e) => ({
      id: e.id as number,
      postId: e.post_id as string,
      kind: e.kind as string,
      message: (e.message as string) ?? "",
      at: e.created_at as string,
    })),
  };
}
