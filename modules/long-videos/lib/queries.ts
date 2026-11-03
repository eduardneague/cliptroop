import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LONG_MEDIA_KEEP_DAYS, DEFAULT_STUDIO_KEEP_DAYS, readKeep, type KeepSetting } from "@/lib/media-keep";

/**
 * One project row, fetched at most ONCE per request — generateMetadata
 * (the browser tab title) and the page itself both call this, and cache()
 * makes the second call free instead of a duplicate query.
 * RLS applies: returns null if the viewer isn't on the project's team.
 */
export const getProject = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("long_video_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
});

/**
 * Team → Defaults → Video files (1.25.0): how long a posted long video's
 * edit stays, how long Thumbnail Studio keeps the thumbnails that didn't
 * win (null = keep them), and what's stored now. `ready` is false before
 * migration 0089.
 */
export async function getLongFilesKeep(teamId: string): Promise<{
  ready: boolean;
  /** null: never deleted (1.27.5). */
  longDays: KeepSetting;
  studioDays: KeepSetting;
  files: number;
  bytes: number;
  thumbs: number;
}> {
  const supabase = await createClient();
  const [team, files, thumbs] = await Promise.all([
    supabase.from("teams").select("long_media_keep_days, studio_keep_days").eq("id", teamId).maybeSingle(),
    supabase.from("long_video_versions").select("size_bytes").eq("team_id", teamId).is("deleted_at", null).limit(5000),
    supabase.from("package_entries").select("id, long_video_projects!inner(team_id)", { count: "exact", head: true }).eq("long_video_projects.team_id", teamId),
  ]);
  const row = team.data as { long_media_keep_days?: unknown; studio_keep_days?: unknown } | null;
  const sizes = ((files.data ?? []) as { size_bytes: number | string }[]).map((f) => Number(f.size_bytes) || 0);
  const longRaw = row?.long_media_keep_days;
  const studio = row?.studio_keep_days;
  return {
    ready: !team.error,
    longDays: team.error ? DEFAULT_LONG_MEDIA_KEEP_DAYS : readKeep(longRaw, DEFAULT_LONG_MEDIA_KEEP_DAYS),
    studioDays: team.error ? DEFAULT_STUDIO_KEEP_DAYS : readKeep(studio, DEFAULT_STUDIO_KEEP_DAYS),
    files: sizes.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
    thumbs: thumbs.count ?? 0,
  };
}
