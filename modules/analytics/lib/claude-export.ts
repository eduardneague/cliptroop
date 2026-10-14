import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SocialPlatform } from "@/lib/social/providers";
import { getAdvanced, hooksFor, type AdvancedData } from "./advanced";
import { breakdownLabel } from "./advanced-labels";
import { canViewRevenue, getPlatformStatus } from "./queries";
import { windowFor, type RangeId } from "./ranges";

/*
 * Everything for "Download for Claude" (1.16.0), gathered once: each chosen
 * platform's Advanced numbers and videos, the full scripts when asked for,
 * each short's frames (a short-lived private link), and each video's own
 * traffic and searches. The browser turns it into the .txt and the PDF.
 * Read with the person's own client: their team only, money only if they
 * may see it and asked for it.
 */

export type ClaudeExportOptions = {
  platforms: SocialPlatform[];
  range: RangeId;
  /** all: every video ClipTroop has; top: the most viewed; range: published in the range. */
  which: "all" | "top" | "range";
  top: number;
  scripts: boolean;
  revenue: boolean;
  /** Lifetime and custom ranges: their first day (1.20.0). */
  start?: string | null;
};

export type ClaudeExportData = {
  team: string;
  tz: string;
  exportedAt: string;
  range: { id: RangeId; from: string; to: string; days: number };
  which: ClaudeExportOptions["which"];
  platforms: AdvancedData[];
  accounts: Partial<Record<SocialPlatform, string | null>>;
  /** "s:<short id>" / "l:<project id>" → the script's full text. */
  scripts: Record<string, string>;
  /** Short id → a private link (an hour) to its frames picture. */
  frames: Record<string, string>;
  /** "<platform>:<video id>" → where its views came from and what people searched. */
  splits: Record<string, { traffic: { label: string; views: number }[]; searches: { label: string; views: number }[] }>;
  revenueIncluded: boolean;
};

const MAX_PER_PLATFORM = 200;

export async function gatherClaudeExport(teamId: string, team: { name: string; tz: string }, o: ClaudeExportOptions, today: string): Promise<ClaudeExportData> {
  const supabase = await createClient();
  const w = windowFor(o.range, today, o.start);
  const [allowed, status] = await Promise.all([o.revenue ? canViewRevenue(supabase, teamId) : Promise.resolve(false), getPlatformStatus(teamId)]);
  const list: AdvancedData[] = [];
  for (const platform of o.platforms) {
    const a = await getAdvanced(teamId, w, { platform, content: "all", tz: team.tz, revenueAllowed: allowed, currency: null });
    if (!a.platforms.find((x) => x.platform === platform)?.usable) continue;
    let videos = a.videos;
    if (o.which === "range") videos = videos.filter((v) => v.publishedAt && v.publishedAt.slice(0, 10) >= w.from && v.publishedAt.slice(0, 10) <= w.to);
    if (o.which === "top") videos = [...videos].sort((x, y) => (y.views ?? -1) - (x.views ?? -1)).slice(0, Math.max(5, Math.min(MAX_PER_PLATFORM, o.top)));
    list.push({ ...a, videos: videos.slice(0, MAX_PER_PLATFORM) });
  }
  const videos = list.flatMap((a) => a.videos);

  // The scripts, whole (the videos already carry their hooks).
  let scripts: Record<string, string> = {};
  if (o.scripts) {
    const rows = videos.filter((v) => v.ours).map((v) => ({ short_id: v.ours!.kind === "short" ? v.ours!.id : null, project_id: v.ours!.kind === "long" ? v.ours!.id : null }));
    scripts = Object.fromEntries(await hooksFor(supabase, rows, true));
    for (const k of Object.keys(scripts)) scripts[k] = scripts[k].slice(0, 6000);
  }

  // Each short's frames: the newest version that has them (kept after the video file is cleaned up).
  const frames: Record<string, string> = {};
  const shortIds = [...new Set(videos.filter((v) => v.ours?.kind === "short").map((v) => v.ours!.id))];
  for (let i = 0; i < shortIds.length; i += 100) {
    const { data, error } = await supabase
      .from("short_video_versions")
      .select("short_id, frames_path, version_number")
      .in("short_id", shortIds.slice(i, i + 100))
      .not("frames_path", "is", null)
      .order("version_number", { ascending: false });
    if (error) break; // Before migration 0081.
    const newest = new Map<string, string>();
    for (const r of (data ?? []) as { short_id: string; frames_path: string }[]) if (!newest.has(r.short_id)) newest.set(r.short_id, r.frames_path);
    if (!newest.size) continue;
    const { data: signed } = await supabase.storage.from("video-frames").createSignedUrls([...newest.values()], 3600);
    const byPath = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
    for (const [id, path] of newest) if (byPath.get(path)) frames[id] = byPath.get(path)!;
  }

  // Each video's own traffic and searches (YouTube; a few videos get them each morning).
  const splits: ClaudeExportData["splits"] = {};
  for (const a of list) {
    if (a.platform !== "youtube") continue;
    const { data } = await supabase.from("analytics_breakdowns").select("external_id, dimension, key, views").eq("team_id", teamId).eq("platform", a.platform).neq("external_id", "").eq("span", 0).limit(8000);
    const wanted = new Set(a.videos.map((v) => v.id));
    for (const r of (data ?? []) as { external_id: string; dimension: string; key: string; views: number | null }[]) {
      if (!wanted.has(r.external_id) || !r.views) continue;
      const k = `${a.platform}:${r.external_id}`;
      const cur = (splits[k] ??= { traffic: [], searches: [] });
      const item = { label: breakdownLabel(r.dimension, r.key), views: Number(r.views) };
      if (r.dimension === "traffic_source") cur.traffic.push(item);
      else if (r.dimension === "search_term") cur.searches.push(item);
    }
    for (const s of Object.values(splits)) {
      s.traffic.sort((x, y) => y.views - x.views);
      s.searches.sort((x, y) => y.views - x.views).splice(10);
    }
  }

  return {
    team: team.name,
    tz: team.tz,
    exportedAt: new Date().toISOString(),
    range: { id: o.range, from: w.from, to: w.to, days: w.days },
    which: o.which,
    platforms: list,
    accounts: Object.fromEntries(status.filter((s) => s.connected).map((s) => [s.platform, s.account])),
    scripts,
    frames,
    splits,
    revenueIncluded: allowed,
  };
}
