"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getAccessToken } from "@/lib/social/tokens";
import { tiktokCall, type TikTokOptions } from "@/lib/social/publishers/tiktok";
import { PublishError } from "@/lib/social/publishers/common";
import { runDuePosts } from "@/lib/social/worker";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
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
  if (post.platform === "youtube" && post.external_id) {
    return { error: "It's already uploaded to YouTube and scheduled there. Delete or change it in YouTube Studio." };
  }
  if (!["scheduled", "failed"].includes(post.status as string)) {
    return { error: "It's already being posted and can't be cancelled now." };
  }
  const admin = createAdminClient();
  await admin.from("social_posts").update({ status: "cancelled", locked_until: null, updated_at: new Date().toISOString() }).eq("id", postId).in("status", ["scheduled", "failed"]);
  await admin.from("social_post_events").insert({ post_id: postId, team_id: post.team_id, kind: "cancelled", message: "Cancelled", actor_id: m.user.id });
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
  const r = await runDuePosts(50_000);
  revalidatePath(`/shorts/${shortId}`);
  return { claimed: r.claimed ?? 0 };
}
