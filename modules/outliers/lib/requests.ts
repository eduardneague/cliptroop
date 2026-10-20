import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBudgets } from "./budget";
import { addChannels, ensureChannels, ingestVideos, requestCtx, scanChannel, type Niche } from "./collector";
import { channelRow, parseChannelRef, type ChannelRef } from "./ingest";
import { projectedScore } from "./scores";
import { outliersAccess, QuotaError, spender, YouTube, YtError, quotaDay } from "./youtube";

/*
 * What people ask YouTube for directly (1.27.0), server only: a fresh search
 * for any words, adding a channel by its link, the latest numbers of the
 * video they opened. The caller has already checked who's asking; these
 * use the admin client only with what YouTube answered.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Midnight in Los Angeles (YouTube's day), as an ISO time, for counting today's searches. */
function quotaDayStart(): string {
  const day = quotaDay();
  // Los Angeles is 7 or 8 hours behind UTC: take the earlier and count a little more, never less.
  return new Date(Date.parse(`${day}T07:00:00Z`)).toISOString();
}

export type LiveSearchOptions = { kind?: "long" | "short" | null; days?: number | null; lang?: string | null; region?: string | null };
export type LiveSearchResult = { key: string; ids: string[]; fresh: boolean; left: { person: number; team: number } } | { error: string };

export function searchKey(q: string, o: LiveSearchOptions): string {
  const norm = q.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(`${norm}|${o.kind ?? ""}|${o.days ?? ""}|${o.lang ?? ""}|${o.region ?? ""}`).digest("base64url").slice(0, 24);
}

/** How many fresh searches this person and this team have left today. */
export async function searchesLeft(admin: Admin, teamId: string, userId: string): Promise<{ person: number; team: number }> {
  const b = readBudgets();
  const since = quotaDayStart();
  const [{ count: mine }, { count: team }] = await Promise.all([
    admin.from("outlier_search_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("fresh", true).gte("at", since),
    admin.from("outlier_search_log").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("fresh", true).gte("at", since),
  ]);
  return { person: Math.max(0, b.personSearches - (mine ?? 0)), team: Math.max(0, b.teamSearches - (team ?? 0)) };
}

/**
 * Searches YouTube for `q` (the top videos of the window when there is one,
 * else the most relevant), saves what it finds and scores their channels.
 * The same search within a day comes from the saved answer (no quota).
 */
export async function liveSearch(teamId: string, userId: string, qRaw: string, o: LiveSearchOptions = {}): Promise<LiveSearchResult> {
  const q = qRaw.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 2) return { error: "Type at least two letters." };
  const admin = createAdminClient();
  const key = searchKey(q, o);
  const { data: cached } = await admin.from("outlier_search_cache").select("video_ids, at").eq("key", key).gte("at", new Date(Date.now() - 24 * 3_600_000).toISOString()).maybeSingle();
  const left = await searchesLeft(admin, teamId, userId);
  if (cached) {
    await admin.from("outlier_search_log").insert({ team_id: teamId, user_id: userId, key, q, fresh: false });
    return { key, ids: (cached.video_ids as string[]) ?? [], fresh: false, left };
  }
  if (left.person <= 0) return { error: "You've used today's fresh YouTube searches. Searching what's already collected still works, and the count resets at midnight Pacific time." };
  if (left.team <= 0) return { error: "The team has used today's fresh YouTube searches. Searching what's already collected still works." };
  const access = await outliersAccess(teamId);
  if (!access) return { error: "Connect the team's YouTube channel first (Team → Connected accounts), or ask the developer to add a YouTube API key." };
  const b = readBudgets();
  const yt = new YouTube(access, spender(admin, { search: b.searches, units: b.units, stats: b.stats }, { search: 1, units: 90, stats: 0 }));
  const ctx = requestCtx(admin, yt, teamId, [], 22_000);
  try {
    const { ids } = await yt.search({
      q,
      order: o.days ? "viewCount" : "relevance",
      publishedAfter: o.days ? new Date(Date.now() - o.days * 86_400_000).toISOString() : undefined,
      videoDuration: o.kind === "short" ? "short" : undefined,
      relevanceLanguage: o.lang ?? null,
      regionCode: o.region ?? null,
    });
    const rows = await ingestVideos(ctx, ids, { player: true });
    // Channels never read before: their latest videos, so these get a score (the biggest first, while there's time).
    const chans = [...new Set(rows.map((r) => r.channel_id))];
    const { data: seen } = await admin.from("yt_channels").select("id, scanned_at, subscribers").in("id", chans);
    const fresh = ((seen ?? []) as { id: string; scanned_at: string | null; subscribers: number | null }[]).filter((c) => !c.scanned_at).sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0));
    for (const c of fresh.slice(0, 10)) {
      if (!ctx.left(5000)) break;
      try {
        await scanChannel(ctx, c.id, o.kind ? [o.kind] : ["long", "short"], []);
      } catch (e) {
        if (e instanceof QuotaError) break;
      }
    }
    const found = rows.map((r) => r.id);
    await admin.from("outlier_search_cache").upsert({ key, q, params: o, video_ids: found, at: new Date().toISOString() }, { onConflict: "key" });
    await admin.from("outlier_search_log").insert({ team_id: teamId, user_id: userId, key, q, fresh: true });
    return { key, ids: found, fresh: true, left: { person: left.person - 1, team: left.team - 1 } };
  } catch (e) {
    if (e instanceof QuotaError) return { error: e.message };
    if (e instanceof YtError) return { error: `YouTube said no: ${e.message}` };
    throw e;
  }
}

/** A saved search's videos (from the address: ?search=key), when it's still kept. */
export async function cachedSearch(key: string): Promise<{ q: string; ids: string[] } | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const { data } = await createAdminClient().from("outlier_search_cache").select("q, video_ids").eq("key", key).maybeSingle();
  return data ? { q: data.q as string, ids: (data.video_ids as string[]) ?? [] } : null;
}

/** Finds a channel from a pasted link, handle or id (and a video's channel from a video link). */
async function resolveChannel(yt: YouTube, ref: NonNullable<ChannelRef>) {
  if (ref.kind === "id") return (await yt.channels([ref.id]))[0] ?? null;
  if (ref.kind === "handle") return await yt.channelByHandle(ref.handle);
  const v = (await yt.videos([ref.id]))[0];
  const cid = v?.snippet?.channelId;
  return cid ? (await yt.channels([cid]))[0] ?? null : null;
}

/**
 * Adds a channel someone pasted to a niche of the team (as one they picked:
 * it always counts) and/or tracks it, then reads its latest videos.
 */
export async function addChannelByRef(teamId: string, input: string, o: { nicheId?: string | null; track?: boolean; userId: string }): Promise<{ id: string; title: string } | { error: string }> {
  const ref = parseChannelRef(input);
  if (!ref) return { error: "That doesn't look like a YouTube channel. Paste its link, its @handle, or a link to one of its videos." };
  const admin = createAdminClient();
  const access = await outliersAccess(teamId);
  if (!access) return { error: "Connect the team's YouTube channel first (Team → Connected accounts), or ask the developer to add a YouTube API key." };
  const b = readBudgets();
  const yt = new YouTube(access, spender(admin, { search: b.searches, units: b.units, stats: b.stats }, { search: 0, units: 12, stats: 0 }));
  let niche: Niche | null = null;
  if (o.nicheId) {
    const { data } = await admin.from("outlier_niches").select("*").eq("id", o.nicheId).eq("team_id", teamId).maybeSingle();
    if (!data) return { error: "That niche isn't this team's." };
    niche = { ...(data as Niche), crawl: ((data as Niche).crawl ?? {}) as Niche["crawl"] };
  }
  const ctx = requestCtx(admin, yt, teamId, niche ? [niche] : [], 20_000);
  try {
    const item = await resolveChannel(yt, ref);
    const row = item ? channelRow(item) : null;
    if (!row) return { error: "YouTube couldn't find that channel." };
    await ensureChannels(ctx, [row.id]);
    if (niche) await addChannels(ctx, niche, [row.id], "manual");
    if (o.track) await admin.from("outlier_tracked").upsert({ team_id: teamId, channel_id: row.id, added_by: o.userId }, { onConflict: "team_id,channel_id", ignoreDuplicates: true });
    try {
      await scanChannel(ctx, row.id, (niche?.kinds as ("long" | "short")[] | undefined) ?? ["long", "short"], niche ? [niche] : []);
    } catch (e) {
      if (!(e instanceof QuotaError)) throw e;
    }
    return { id: row.id, title: row.title };
  } catch (e) {
    if (e instanceof QuotaError) return { error: e.message };
    if (e instanceof YtError) return { error: `YouTube said no: ${e.message}` };
    throw e;
  }
}

/** The latest numbers of one video (when its panel opens and they're more than 6 hours old). */
export async function refreshVideo(teamId: string, id: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: v } = await admin.from("yt_videos").select("id, views, score, published_at, stats_at").eq("id", id).maybeSingle();
  if (!v || (v.stats_at && Date.parse(v.stats_at as string) > Date.now() - 6 * 3_600_000)) return false;
  const access = await outliersAccess(teamId);
  if (!access) return false;
  const b = readBudgets();
  const yt = new YouTube(access, spender(admin, { search: 0, units: b.units, stats: b.stats }, { search: 0, units: 1, stats: 1 }));
  try {
    const s = (await yt.stats([id])).get(id);
    if (!s) return false;
    const prev = v as { views: number | null; score: number | null; published_at: string; stats_at: string | null };
    const score = prev.score !== null && prev.views && s.views !== null ? Math.round(prev.score * (s.views / prev.views) * 1000) / 1000 : prev.score;
    const hours = prev.stats_at ? (Date.now() - Date.parse(prev.stats_at)) / 3_600_000 : 0;
    const vph = s.views !== null && prev.views !== null && hours >= 0.25 && hours <= 48 ? Math.max(0, Math.round((s.views - prev.views) / hours)) : null;
    await admin.rpc("outliers_set_stats", { p: [{ id, views: s.views, likes: s.likes, comments: s.comments, score, projected: projectedScore(score, prev.published_at), vph }] });
    if (Date.now() - Date.parse(prev.published_at) < 30 * 86_400_000 && s.views !== null)
      await admin.from("yt_video_stats").upsert({ video_id: id, at: new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString(), views: s.views, likes: s.likes, comments: s.comments }, { onConflict: "video_id,at", ignoreDuplicates: true });
    return true;
  } catch {
    return false;
  }
}
