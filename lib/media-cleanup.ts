import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MEDIA_KEEP_DAYS, dueForCleanup, isMediaKeepDays } from "@/lib/media-keep";

/**
 * The nightly clean-up (Supabase's timer, {"job": "cleanup"}, 0070):
 * once a short is posted everywhere, every version of its video (the
 * approved one too) is deleted from storage after the team's choice
 * (teams.media_keep_days: 1, 2, 3 weeks or 1 month; 2 weeks by default).
 *
 *   - Counted from the LAST platform it went out on.
 *   - Never while a post still needs the file (scheduled, running, failed).
 *   - Shorts with keep_media are skipped.
 *   - The short stays: title, script, notes, numbers. Its versions are
 *     marked deleted_at, so the review page says "Cleaned up after posting".
 */
export async function cleanupPostedMedia(): Promise<{ removed: number; failed: number; checked: number }> {
  const admin = createAdminClient();
  const now = Date.now();

  // Only shorts that still have files are worth a look.
  const { data: live, error: liveError } = await admin.from("short_video_versions").select("short_id").is("deleted_at", null).limit(5000);
  if (liveError) throw new Error(`Couldn't read the video files: ${liveError.message}`);
  const withFiles = new Set((live ?? []).map((v) => v.short_id as string));
  if (withFiles.size === 0) return { removed: 0, failed: 0, checked: 0 };

  // Each team's choice (before 0070: the default for everyone).
  const keepFor = new Map<string, number>();
  const { data: teams, error: teamsError } = await admin.from("teams").select("id, media_keep_days");
  if (!teamsError) {
    for (const t of teams ?? []) keepFor.set(t.id as string, isMediaKeepDays(t.media_keep_days) ? t.media_keep_days : DEFAULT_MEDIA_KEEP_DAYS);
  }

  // Posted shorts with files, 150 ids per request (the address has a length limit).
  const ids = Array.from(withFiles);
  const shorts: { id: string; team_id: string; short_video_posts: { posted_at: string }[] | null }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin
      .from("short_videos")
      .select("id, team_id, short_video_posts(posted_at)")
      .eq("stage", "posted")
      .eq("keep_media", false)
      .in("id", ids.slice(i, i + 150));
    if (error) throw new Error(`Couldn't read the shorts: ${error.message}`);
    shorts.push(...((data ?? []) as unknown as typeof shorts));
  }

  let removed = 0;
  let failed = 0;
  for (const s of shorts) {
    const keepDays = keepFor.get(s.team_id) ?? DEFAULT_MEDIA_KEEP_DAYS;
    if (!dueForCleanup((s.short_video_posts ?? []).map((p) => p.posted_at), keepDays, now)) continue;

    // Never while a post still needs the file (scheduled, running or failed).
    const { count: open, error: openError } = await admin
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("short_id", s.id)
      .not("status", "in", "(published,cancelled)");
    // Can't tell? Keep the files and look again tomorrow.
    if (openError || open === null || open > 0) continue;

    const { data: versions } = await admin.from("short_video_versions").select("id, storage_path").eq("short_id", s.id).is("deleted_at", null);
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
  return { removed, failed, checked: shorts.length };
}
