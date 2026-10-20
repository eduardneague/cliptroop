import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LONG_MEDIA_KEEP_DAYS, DEFAULT_MEDIA_KEEP_DAYS, DEFAULT_STUDIO_KEEP_DAYS, dueForCleanup, longPostedTimes, readKeep, studioDue, type KeepSetting } from "@/lib/media-keep";

/**
 * The nightly clean-up (Supabase's timer, {"job": "cleanup"}, 0070):
 * once a short is posted everywhere, every version of its video (the
 * approved one too) is deleted from storage after the team's choice
 * (teams.media_keep_days: 1 day to 1 year, or never (null; 1.27.5); 2 weeks by default).
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

  // Each team's choice (before 0070: the default for everyone; null: never).
  const keepFor = new Map<string, KeepSetting>();
  const { data: teams, error: teamsError } = await admin.from("teams").select("id, media_keep_days");
  if (!teamsError) {
    for (const t of teams ?? []) keepFor.set(t.id as string, readKeep(t.media_keep_days, DEFAULT_MEDIA_KEEP_DAYS));
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
    const keepDays = keepFor.has(s.team_id) ? keepFor.get(s.team_id)! : DEFAULT_MEDIA_KEEP_DAYS;
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

/** Before migration 0089 the tables and columns below aren't there yet: nothing to do. */
const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204");

type PostedProject = { id: string; team_id: string; posted_at: string | null; long_video_posts: { posted_at: string }[] | null };

/** Posted long videos among these ids, 150 per request (the address has a length limit). */
async function postedLongVideos(admin: ReturnType<typeof createAdminClient>, ids: string[], onlyUnkept: boolean): Promise<PostedProject[]> {
  const out: PostedProject[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    let q = admin.from("long_video_projects").select("id, team_id, posted_at, long_video_posts(posted_at)").eq("stage", "done").in("id", ids.slice(i, i + 150));
    if (onlyUnkept) q = q.eq("keep_media", false);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't read the long videos: ${error.message}`);
    out.push(...((data ?? []) as unknown as PostedProject[]));
  }
  return out;
}

const postedTimes = (p: PostedProject) => longPostedTimes(p.long_video_posts, p.posted_at);

/**
 * Long videos (1.25.0), the same nightly clean-up: once a long video is
 * posted (Posted step), every version of its edit is deleted from storage
 * after the team's choice (teams.long_media_keep_days: 1 day to 1 year, or
 * never (1.27.5); 1 week by default), counted from the last platform it went out on.
 * Videos with keep_media are skipped; the video itself stays, its versions
 * are marked deleted_at.
 */
export async function cleanupPostedLongMedia(): Promise<{ removed: number; failed: number; checked: number }> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: live, error: liveError } = await admin.from("long_video_versions").select("project_id").is("deleted_at", null).limit(5000);
  if (missing(liveError)) return { removed: 0, failed: 0, checked: 0 };
  if (liveError) throw new Error(`Couldn't read the long video files: ${liveError.message}`);
  const withFiles = Array.from(new Set((live ?? []).map((v) => v.project_id as string)));
  if (withFiles.length === 0) return { removed: 0, failed: 0, checked: 0 };

  const keepFor = new Map<string, KeepSetting>();
  const { data: teams, error: teamsError } = await admin.from("teams").select("id, long_media_keep_days");
  if (teamsError) throw new Error(`Couldn't read the teams: ${teamsError.message}`);
  for (const t of teams ?? []) keepFor.set(t.id as string, readKeep(t.long_media_keep_days, DEFAULT_LONG_MEDIA_KEEP_DAYS));

  const projects = await postedLongVideos(admin, withFiles, true);
  let removed = 0;
  let failed = 0;
  for (const p of projects) {
    const keepDays = keepFor.has(p.team_id) ? keepFor.get(p.team_id)! : DEFAULT_LONG_MEDIA_KEEP_DAYS;
    if (!dueForCleanup(postedTimes(p), keepDays, now)) continue;

    const { data: versions } = await admin.from("long_video_versions").select("id, storage_path").eq("project_id", p.id).is("deleted_at", null);
    const due = versions ?? [];
    if (due.length === 0) continue;
    const { error: rmError } = await admin.storage.from("long-review-videos").remove(due.map((v) => v.storage_path as string));
    if (rmError) {
      failed += due.length;
      continue;
    }
    await admin
      .from("long_video_versions")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", due.map((v) => v.id as string));
    removed += due.length;
  }
  return { removed, failed, checked: projects.length };
}

/**
 * Thumbnail Studio (1.25.0): once a long video is posted, the thumbnails
 * that didn't win are deleted (their files and their rows) after the team's
 * choice (teams.studio_keep_days: 1 day to 1 year, 1 month by default;
 * empty = keep them), counted from the last platform it went out on. The
 * winners always stay (search and the lists show them); with none picked,
 * the first one stays.
 */
export async function cleanupStudioThumbs(): Promise<{ removed: number; failed: number; checked: number }> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: teams, error: teamsError } = await admin.from("teams").select("id, studio_keep_days");
  if (missing(teamsError)) return { removed: 0, failed: 0, checked: 0 };
  if (teamsError) throw new Error(`Couldn't read the teams: ${teamsError.message}`);
  // Only teams that chose a time (empty = keep them).
  const keepFor = new Map<string, number>();
  for (const t of teams ?? []) {
    const d = readKeep(t.studio_keep_days, DEFAULT_STUDIO_KEEP_DAYS);
    if (d !== null) keepFor.set(t.id as string, d);
  }
  if (keepFor.size === 0) return { removed: 0, failed: 0, checked: 0 };

  const { data: losers, error: losersError } = await admin.from("package_entries").select("project_id").eq("is_winner", false).limit(5000);
  if (losersError) throw new Error(`Couldn't read the thumbnails: ${losersError.message}`);
  const withLosers = Array.from(new Set((losers ?? []).map((e) => e.project_id as string)));
  if (withLosers.length === 0) return { removed: 0, failed: 0, checked: 0 };

  const projects = await postedLongVideos(admin, withLosers, false);
  let removed = 0;
  let failed = 0;
  for (const p of projects) {
    const keepDays = keepFor.get(p.team_id);
    if (!keepDays || !dueForCleanup(postedTimes(p), keepDays, now)) continue;

    const { data: entries } = await admin.from("package_entries").select("id, thumbnail_storage_path, is_winner").eq("project_id", p.id).order("position");
    // No winner picked: the first one stays, as the video's picture (the Package card's too).
    const due = studioDue((entries ?? []) as { id: string; thumbnail_storage_path: string | null; is_winner: boolean }[]);
    if (due.length === 0) continue;
    const paths = due.map((e) => e.thumbnail_storage_path as string | null).filter((x): x is string => !!x);
    if (paths.length) {
      const { error: rmError } = await admin.storage.from("package-thumbs").remove(paths);
      if (rmError) {
        failed += due.length;
        continue;
      }
    }
    const { error: delError } = await admin
      .from("package_entries")
      .delete()
      .in("id", due.map((e) => e.id as string))
      .eq("is_winner", false);
    if (delError) failed += due.length;
    else removed += due.length;
  }
  return { removed, failed, checked: projects.length };
}
