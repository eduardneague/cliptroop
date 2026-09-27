import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily cleanup of review videos (Vercel Cron, see vercel.json).
 *   * Old versions (not the approved one): deleted 30 days after posting.
 *   * The approved version: deleted 90 days after posting.
 *   * Shorts marked "Keep" are never cleaned up.
 * Protected by CRON_SECRET: Vercel sends it as "Authorization: Bearer …".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const DRAFT_DAYS = 30;
const FINAL_DAYS = 90;

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
    if (age < DRAFT_DAYS * DAY) continue;

    const { data: versions } = await admin
      .from("short_video_versions")
      .select("id, storage_path")
      .eq("short_id", s.id)
      .is("deleted_at", null);

    const due = (versions ?? []).filter((v) =>
      v.id === s.approved_version_id ? age >= FINAL_DAYS * DAY : true
    );
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

  return NextResponse.json({ ok: true, removed, failed });
}
