"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getAccessToken } from "@/lib/social/tokens";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(projectId: string) {
  revalidatePath(`/videos/${projectId}/studio`);
  revalidatePath(`/videos/${projectId}`);
}

/** After the browser uploads an image into the video's folder: add the variation. */
export async function registerVariant(
  projectId: string,
  input: { path: string; width: number; height: number; size: number; title: string }
): Promise<Result<{ id: string }>> {
  if (!UUID.test(projectId)) return { error: "Video not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("package_entries")
    .insert({
      project_id: projectId,
      title: String(input.title ?? "").trim().slice(0, 100) || "Untitled",
      thumbnail_storage_path: input.path,
      width: Math.round(input.width) || null,
      height: Math.round(input.height) || null,
      size_bytes: Math.round(input.size) || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23514" ? error.message : "Couldn't add the thumbnail. Only the master or a packager can." };
  refresh(projectId);
  return { id: data.id as string };
}

export async function renameVariant(id: string, title: string): Promise<Result> {
  const t = String(title ?? "").trim();
  if (!t) return { error: "Give it a title." };
  if (t.length > 100) return { error: "YouTube titles can be up to 100 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("package_entries").update({ title: t }).eq("id", id).select("project_id");
  if (error || !data?.length) return { error: "Only the master or a packager can rename." };
  refresh(data[0].project_id as string);
  return {};
}

export async function deleteVariant(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("package_entries").select("project_id, thumbnail_storage_path").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found." };
  const { data, error } = await supabase.from("package_entries").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only the master or a packager can delete." };
  if (row.thumbnail_storage_path) await supabase.storage.from("package-thumbs").remove([row.thumbnail_storage_path as string]);
  refresh(row.project_id as string);
  return {};
}

export async function pickWinner(id: string, projectId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_package_winner", { p_entry: id });
  if (error) return { error: error.code === "42501" ? error.message : "Couldn't pick it. Try again." };
  refresh(projectId);
  return {};
}

// ---------------------------------------------------------------------------
// Placeholder library: import popular videos from YouTube (on demand)
// ---------------------------------------------------------------------------

const CATEGORIES: { id: string | null; name: string }[] = [
  { id: null, name: "Popular" },
  { id: "28", name: "Science & Tech" },
  { id: "20", name: "Gaming" },
  { id: "24", name: "Entertainment" },
];

function isoDuration(iso: string | undefined) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "");
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}

async function inBatches<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

type YtVideo = {
  id: string;
  snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string; thumbnails: Record<string, { url: string }> };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
};

/**
 * Refresh the team's placeholder library from YouTube's "Most popular"
 * lists (+ tech, gaming, entertainment). Images are copied into private
 * storage so the mockups load instantly. The old library stays in place
 * until the new one is fully stored.
 */
export async function importLibrary(teamId: string, region: string): Promise<Result<{ count: number }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const regionCode = /^[A-Z]{2}$/.test(region) ? region : "US";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const roles = (await getMembership(supabase, teamId))?.roles ?? [];
  if (!isMaster(roles) && !roles.includes("packager")) return { error: "Only the master or a packager can import." };

  const admin = createAdminClient();
  const { data: account } = await admin.from("social_accounts").select("id").eq("team_id", teamId).eq("platform", "youtube").maybeSingle();
  if (!account) return { error: "Connect YouTube first (Team → Connected accounts): the import uses it." };
  let token: string;
  try {
    token = await getAccessToken(account.id as string);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't sign in to YouTube." };
  }
  const yt = async (path: string) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    return r.ok ? ((await r.json()) as { items?: unknown[]; nextPageToken?: string }) : null;
  };

  // 1) Collect ~200 unique popular videos across the categories.
  const byId = new Map<string, YtVideo & { category: string }>();
  for (const cat of CATEGORIES) {
    let page: string | undefined;
    for (let i = 0; i < 2 && byId.size < 220; i++) {
      const q = new URLSearchParams({ part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode, maxResults: "50", ...(cat.id ? { videoCategoryId: cat.id } : {}), ...(page ? { pageToken: page } : {}) });
      const res = await yt(`videos?${q}`);
      if (!res) break; // some categories aren't available in some regions
      for (const v of (res.items ?? []) as YtVideo[]) if (!byId.has(v.id)) byId.set(v.id, { ...v, category: cat.name });
      page = res.nextPageToken;
      if (!page) break;
    }
  }
  const videos = [...byId.values()].filter((v) => (isoDuration(v.contentDetails?.duration) ?? 0) > 60).slice(0, 200);
  if (!videos.length) return { error: "YouTube didn't return any videos. Try again later." };

  // 2) Channel pictures (50 per request).
  const channelIds = [...new Set(videos.map((v) => v.snippet.channelId))];
  const avatars = new Map<string, string>();
  for (let i = 0; i < channelIds.length; i += 50) {
    const res = await yt(`channels?${new URLSearchParams({ part: "snippet", id: channelIds.slice(i, i + 50).join(","), maxResults: "50" })}`);
    for (const c of (res?.items ?? []) as { id: string; snippet: { thumbnails: Record<string, { url: string }> } }[]) {
      const url = c.snippet.thumbnails.default?.url;
      if (url) avatars.set(c.id, url);
    }
  }

  // 3) Copy the images into private storage (10 at a time).
  const store = async (url: string, path: string) => {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) return false;
    const { error } = await admin.storage.from("mockup-library").upload(path, await r.arrayBuffer(), { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    return !error;
  };
  const rows: Record<string, unknown>[] = [];
  await inBatches(videos, 10, async (v) => {
    const t = v.snippet.thumbnails;
    const thumbUrl = (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url;
    if (!thumbUrl) return;
    const thumbPath = `${teamId}/v/${v.id}.jpg`;
    if (!(await store(thumbUrl, thumbPath))) return;
    rows.push({
      team_id: teamId,
      youtube_id: v.id,
      title: v.snippet.title.slice(0, 200),
      channel: v.snippet.channelTitle.slice(0, 100),
      thumb_path: thumbPath,
      channel_avatar_path: avatars.has(v.snippet.channelId) ? `${teamId}/c/${v.snippet.channelId}.jpg` : null,
      views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
      published_at: v.snippet.publishedAt,
      duration_sec: isoDuration(v.contentDetails?.duration),
      category: v.category,
      region: regionCode,
      imported_at: new Date().toISOString(),
    });
  });
  await inBatches([...avatars.entries()], 10, async ([cid, url]) => {
    await store(url, `${teamId}/c/${cid}.jpg`);
  });
  if (!rows.length) return { error: "Couldn't store any images. Try again." };

  // 4) Swap: keep the new set, drop what's no longer in it.
  const { error: upErr } = await admin.from("mockup_videos").upsert(rows, { onConflict: "team_id,youtube_id" });
  if (upErr) return { error: "Couldn't save the library." };
  const keep = rows.map((r) => r.youtube_id as string);
  const { data: old } = await admin.from("mockup_videos").select("youtube_id, thumb_path").eq("team_id", teamId);
  const stale = (old ?? []).filter((o) => !keep.includes(o.youtube_id as string));
  if (stale.length) {
    await admin.from("mockup_videos").delete().eq("team_id", teamId).in("youtube_id", stale.map((o) => o.youtube_id as string));
    await admin.storage.from("mockup-library").remove(stale.map((o) => o.thumb_path as string));
  }
  revalidatePath("/videos", "layout");
  return { count: rows.length };
}
