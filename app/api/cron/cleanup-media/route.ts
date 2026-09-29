import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshExpiring } from "@/lib/social/tokens";

/**
 * Daily upkeep (Vercel Cron, see vercel.json):
 *   * Videos: every version of a short (the approved one too) is deleted
 *     2 days after the short is fully posted. Shorts marked "Keep" are
 *     never cleaned up.
 *   * Connected accounts: sign-ins that expire soon are refreshed.
 * Protected by CRON_SECRET: Vercel sends it as "Authorization: Bearer …".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 2;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();

  // Posted shorts that aren't kept, with when they were last posted.
  const { data: shorts, error } = await admin
    .from("short_videos")
    .select("id, approved_version_id, short_video_posts(posted_at)")
    .eq("stage", "posted")
    .eq("keep_media", false)
    .limit(500);
  if (error) return NextResponse.json({ error: "Couldn't read shorts" }, { status: 500 });

  let removed = 0;
  let failed = 0;
  for (const s of shorts ?? []) {
    const times = ((s.short_video_posts as { posted_at: string }[]) ?? []).map((p) => Date.parse(p.posted_at)).filter(Number.isFinite);
    if (times.length === 0) continue;
    const postedAt = Math.max(...times);
    const age = now - postedAt;
    if (age < KEEP_DAYS * DAY) continue;

    // Never while a post still needs the file (scheduled, running or failed).
    const { count: open } = await admin
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("short_id", s.id)
      .not("status", "in", "(published,cancelled)");
    if ((open ?? 0) > 0) continue;

    const { data: versions } = await admin
      .from("short_video_versions")
      .select("id, storage_path")
      .eq("short_id", s.id)
      .is("deleted_at", null);

    const due = versions ?? [];
    if (due.length === 0) continue;

    const { error: rmError } = await admin.storage.from("review-videos").remove(due.map((v) => v.storage_path as string));
    if (rmError) {
      failed += due.length;
      continue;
    }
    await admin
      .from("short_video_versions")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", due.map((v) => v.id as string));
    removed += due.length;
  }

  // Keep connected accounts signed in (Instagram lasts 60 days, TikTok a year).
  const tokens = await refreshExpiring().catch(() => ({ refreshed: 0, failed: -1 }));

  return NextResponse.json({ ok: true, removed, failed, tokens });
}
