import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBudgets } from "./budget";
import { addChannels, ensureChannels, ingestVideos, requestCtx, scanChannel, type Niche } from "./collector";
import { CHANNEL_ID, channelRow, parseChannelRef, type ChannelRef } from "./ingest";
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

// ---------------------------------------------------------------------------
// 1.29.0: channels on demand, finding channels by name, a niche's own channels
// ---------------------------------------------------------------------------

/**
 * A channel someone just tracked, added to a niche or opened: its details
 * and its latest videos right away (so it shows with scores, not "reading"),
 * unless it was read in the last `freshHours`. `deep`: 150 long videos.
 */
export async function prepareChannel(teamId: string, channelId: string, o: { deep?: boolean; freshHours?: number } = {}): Promise<boolean> {
  if (!CHANNEL_ID.test(channelId)) return false;
  const admin = createAdminClient();
  let { data: c, error } = await admin.from("yt_channels").select("id, scanned_at, scan_depth").eq("id", channelId).maybeSingle();
  // Before 0094: no scan_depth.
  if (error) ({ data: c } = await admin.from("yt_channels").select("id, scanned_at").eq("id", channelId).maybeSingle());
  const row = c as { scanned_at: string | null; scan_depth?: number | null } | null;
  const fresh = row?.scanned_at;
  // Read lately, and deep enough for what's asked (1.29.0: a channel read shallow once was never read deep after).
  if (fresh && Date.parse(fresh) > Date.now() - (o.freshHours ?? 6) * 3_600_000 && (!o.deep || row?.scan_depth === undefined || (row.scan_depth ?? 0) >= 3)) return true;
  const access = await outliersAccess(teamId);
  if (!access) return false;
  const b = readBudgets();
  const yt = new YouTube(access, spender(admin, { search: 0, units: b.units, stats: b.stats }, { search: 0, units: o.deep ? 14 : 8, stats: 0 }));
  const ctx = requestCtx(admin, yt, teamId, [], 25_000);
  try {
    const known = await ensureChannels(ctx, [channelId]);
    if (!known.has(channelId)) return false;
    await scanChannel(ctx, channelId, ["long", "short"], [], { deep: o.deep });
    return true;
  } catch (e) {
    if (e instanceof QuotaError || e instanceof YtError) return false;
    throw e;
  }
}

export type FoundChannel = { id: string; title: string; handle: string | null; avatar: string | null; subs: number | null; country: string | null; stored: boolean };

const toFound = (r: { id: string; title: string; handle: string | null; avatar_url: string | null; subscribers: number | null; country: string | null }, stored: boolean): FoundChannel => ({ id: r.id, title: r.title, handle: r.handle, avatar: r.avatar_url, subs: r.subscribers, country: r.country, stored });

/**
 * Channels by name, an @handle, a link or an id: the ones already collected
 * (anyone's: it's public data) first, then YouTube by handle (one unit; a
 * name like "linus tech tips" is tried as @linustechtips). `youtube`: also a
 * YouTube search of channels (one of the person's daily searches).
 */
export async function findChannels(teamId: string, userId: string, qRaw: string, o: { youtube?: boolean } = {}): Promise<{ rows: FoundChannel[]; searched: boolean; left?: { person: number; team: number } } | { error: string }> {
  const q = qRaw.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 2) return { error: "Type at least two letters." };
  const admin = createAdminClient();
  const out = new Map<string, FoundChannel>();
  const ref = parseChannelRef(q);
  const like = `%${q.replace(/^@/, "").replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const [{ data: byTitle }, { data: byHandle }] = await Promise.all([
    admin.from("yt_channels").select("id, title, handle, avatar_url, subscribers, country").ilike("title", like).order("subscribers", { ascending: false, nullsFirst: false }).limit(12),
    admin.from("yt_channels").select("id, title, handle, avatar_url, subscribers, country").ilike("handle", like).order("subscribers", { ascending: false, nullsFirst: false }).limit(8),
  ]);
  for (const r of [...((byTitle ?? []) as Parameters<typeof toFound>[0][]), ...((byHandle ?? []) as Parameters<typeof toFound>[0][])]) out.set(r.id, toFound(r, true));
  const access = await outliersAccess(teamId);
  if (!access) return { rows: [...out.values()], searched: false };
  const b = readBudgets();
  const wantSearch = !!o.youtube;
  let left: { person: number; team: number } | undefined;
  if (wantSearch) {
    left = await searchesLeft(admin, teamId, userId);
    if (left.person <= 0 || left.team <= 0) return { error: "Today's fresh YouTube searches are used up. Channels already collected still show, and links or @handles still work." };
  }
  const yt = new YouTube(access, spender(admin, { search: b.searches, units: b.units, stats: b.stats }, { search: wantSearch ? 1 : 0, units: 6, stats: 0 }));
  try {
    // A link, an @handle or an id: that channel. A name: tried as a handle too.
    const handle = ref?.kind === "handle" ? ref.handle : /^[\p{L}\p{N} ._-]{3,40}$/u.test(q) ? `@${q.replace(/[\s]+/g, "")}` : null;
    const looked = ref ? await (ref.kind === "id" ? yt.channels([ref.id]).then((x) => x[0] ?? null) : ref.kind === "handle" ? yt.channelByHandle(ref.handle) : yt.videos([ref.id]).then(async (v) => (v[0]?.snippet?.channelId ? (await yt.channels([v[0].snippet.channelId]))[0] ?? null : null))) : handle ? await yt.channelByHandle(handle) : null;
    const rows = [looked].map((x) => (x ? channelRow(x) : null)).filter((x): x is NonNullable<typeof x> => !!x);
    if (wantSearch) {
      const ids = await yt.searchChannels(q, 10);
      if (ids.length) for (const it of await yt.channels(ids.filter((id) => !out.has(id)))) {
        const r = channelRow(it);
        if (r) rows.push(r);
      }
      await admin.from("outlier_search_log").insert({ team_id: teamId, user_id: userId, key: `ch:${q.toLowerCase()}`.slice(0, 40), q, fresh: true });
      if (left) left = { person: left.person - 1, team: left.team - 1 };
    }
    if (rows.length) {
      const { error } = await admin.from("yt_channels").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    // The one asked for exactly goes first.
    const first = rows.map((r) => toFound({ id: r.id, title: r.title, handle: r.handle, avatar_url: r.avatar_url, subscribers: r.subscribers, country: r.country }, false));
    const merged = new Map<string, FoundChannel>();
    for (const r of first) merged.set(r.id, { ...r, stored: out.has(r.id) });
    for (const [id, r] of out) if (!merged.has(id)) merged.set(id, r);
    return { rows: [...merged.values()].slice(0, 20), searched: wantSearch, left };
  } catch (e) {
    if (e instanceof QuotaError) return out.size ? { rows: [...out.values()], searched: false } : { error: e.message };
    if (e instanceof YtError) return out.size ? { rows: [...out.values()], searched: false } : { error: `YouTube said no: ${e.message}` };
    throw e;
  }
}

/**
 * Channels become one of a niche's own (picked: they always count), then the
 * ones never read are read. `source` "audience": picked from the viewers list.
 */
export async function addToNiche(teamId: string, nicheId: string, ids: string[], o: { userId: string; source?: "manual" | "audience" }): Promise<{ added: number } | { error: string }> {
  const clean = [...new Set(ids.filter((x) => CHANNEL_ID.test(x)))].slice(0, 100);
  if (!clean.length) return { error: "Pick a channel first." };
  const admin = createAdminClient();
  const { data } = await admin.from("outlier_niches").select("*").eq("id", nicheId).eq("team_id", teamId).maybeSingle();
  if (!data) return { error: "That niche isn't this team's." };
  const niche = { ...(data as Niche), crawl: ((data as Niche).crawl ?? {}) as Niche["crawl"] };
  const access = await outliersAccess(teamId);
  const b = readBudgets();
  const yt = access ? new YouTube(access, spender(admin, { search: 0, units: b.units, stats: b.stats }, { search: 0, units: 4 + Math.ceil(clean.length / 50), stats: 0 })) : null;
  const ctx = yt ? requestCtx(admin, yt, teamId, [niche], 15_000) : null;
  // Their details first (so they show by name at once); without a way to read YouTube, just the ids.
  if (ctx) {
    try {
      await ensureChannels(ctx, clean);
    } catch (e) {
      if (!(e instanceof QuotaError) && !(e instanceof YtError)) throw e;
    }
  }
  try {
    await addChannels(ctx ?? ({ admin } as never), niche, clean, o.source ?? "manual", o.userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add them." };
  }
  return { added: clean.length };
}
