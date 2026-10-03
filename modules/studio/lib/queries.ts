import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";

export type Variant = {
  id: string;
  title: string;
  url: string | null;
  path: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
  winner: boolean;
};
export type LibraryVideo = {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  avatar: string | null;
  views: number | null;
  publishedAt: string | null;
  duration: number | null;
  category: string | null;
};
export type StudioData = {
  project: { id: string; number: number; title: string; teamId: string };
  variants: Variant[];
  library: LibraryVideo[];
  channel: { name: string; avatar: string | null };
  defaultTitle: string;
  canEdit: boolean;
  canImport: boolean;
};

const HOUR = 3600;

/** Everything the studio needs, in parallel, with signed image links in batches. */
/* cache(): the page and its title both ask for it. */
export const getStudioData = cache(async function getStudioData(projectId: string): Promise<StudioData | null> {
  const supabase = await createClient();
  // What only needs the video's id starts with the video itself.
  const [{ data: project }, { data: entries }, { data: picked }] = await Promise.all([
    supabase.from("long_video_projects").select("id, entry_number, title, team_id").eq("id", projectId).maybeSingle(),
    supabase.from("package_entries").select("id, title, thumbnail_storage_path, width, height, size_bytes, is_winner, position").eq("project_id", projectId).order("position"),
    supabase.from("project_titles").select("title").eq("project_id", projectId).eq("is_picked", true).maybeSingle(),
  ]);
  if (!project) return null;
  const teamId = project.team_id as string;

  const [membership, { data: lib }, { data: yt }, { data: team }] = await Promise.all([
    getMembership(supabase, teamId),
    supabase.from("mockup_videos").select("id, title, channel, thumb_path, channel_avatar_path, views, published_at, duration_sec, category").eq("team_id", teamId).limit(400),
    supabase.from("social_accounts").select("display_name, avatar_url").eq("team_id", teamId).eq("platform", "youtube").maybeSingle(),
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
  ]);

  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>();
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, HOUR);
    return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
  };
  const variantPaths = (entries ?? []).map((e) => e.thumbnail_storage_path as string | null).filter((p): p is string => !!p);
  const libPaths = (lib ?? []).flatMap((v) => [v.thumb_path as string, v.channel_avatar_path as string | null]).filter((p): p is string => !!p);
  const [variantUrls, libUrls] = await Promise.all([sign("package-thumbs", variantPaths), sign("mockup-library", libPaths)]);

  const roles = membership?.roles ?? [];
  const canEdit = isMaster(roles) || roles.includes("packager");
  return {
    project: { id: project.id as string, number: project.entry_number as number, title: project.title as string, teamId },
    variants: (entries ?? []).map((e) => ({
      id: e.id as string,
      title: e.title as string,
      path: (e.thumbnail_storage_path as string | null) ?? null,
      url: e.thumbnail_storage_path ? variantUrls.get(e.thumbnail_storage_path as string) ?? null : null,
      width: (e.width as number | null) ?? null,
      height: (e.height as number | null) ?? null,
      size: e.size_bytes === null ? null : Number(e.size_bytes),
      winner: !!e.is_winner,
    })),
    library: (lib ?? [])
      .map((v) => ({
        id: v.id as string,
        title: v.title as string,
        channel: v.channel as string,
        thumb: libUrls.get(v.thumb_path as string) ?? "",
        avatar: v.channel_avatar_path ? libUrls.get(v.channel_avatar_path as string) ?? null : null,
        views: v.views === null ? null : Number(v.views),
        publishedAt: (v.published_at as string | null) ?? null,
        duration: (v.duration_sec as number | null) ?? null,
        category: (v.category as string | null) ?? null,
      }))
      .filter((v) => v.thumb),
    channel: { name: (yt?.display_name as string | null) ?? (team?.name as string | undefined) ?? "Your channel", avatar: (yt?.avatar_url as string | null) ?? null },
    defaultTitle: (picked?.title as string | undefined) ?? (project.title as string),
    canEdit,
    canImport: canEdit,
  };
});
