import "server-only";
import { decode } from "jpeg-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications, teamMeta } from "@/lib/notify";
import { hoursIntoQuotaDay, leftToday, readBudgets, type Budgets } from "./budget";
import { EXPLORE } from "./explore";
import { detectFormats, FORMAT_VERSION, traitBits } from "./formats";
import { channelRow, playlistsOf, thumbUrl, videoRow, type VideoRow } from "./ingest";
import { buildInsights } from "./insights";
import { channelNumbers, multText, projectedScore } from "./scores";
import { dueSearches, keywordStems, relevanceOf } from "./plan";
import { shortCrop, thumbNumbers } from "./thumb-math";
import { outliersAccess, QuotaError, spender, YouTube, YtError, type Bucket } from "./youtube";
import type { CorpusVideo } from "./corpus";

/*
 * The collector (1.27.0): keeps every niche full of scored videos, within
 * YouTube's budget. Called every 30 minutes by the timer, once per team that
 * follows a niche or tracks a channel and once for the explore niches
 * ({"job": "outliers"} → /api/cron/posting), and right after a niche is
 * added (so it fills in within a minute).
 *
 * One run, until its time is up (each step saves what it did):
 *   1. searches: each niche keyword × a few windows (the top videos of the
 *      last 90 days, of the year, the newest of the last 3 days, the most
 *      relevant), each again after a while; every result's channel joins the
 *      niche;
 *   2. channels: their latest long videos and Shorts (two lists of 50, one
 *      unit each, plus one unit per 50 videos for the numbers), then every
 *      video's score against the channel's usual, the channel's usual, how
 *      often it posts and how much of it is about the niche;
 *   3. featured channels of the most relevant ones join the niche;
 *   4. numbers: young videos every 2 hours (views per hour, heading for),
 *      tracked and saved ones daily, and every video's details before
 *      YouTube's 30 days run out (deleted videos go);
 *   5. thumbnails: a fingerprint and main colours, best videos first;
 *   6. alerts and the Monday summary (teams only);
 *   7. insights for every niche that changed.
 * The explore run also works out older videos' formats again when the
 * detectors changed, and deletes what YouTube's 30 days say must go.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

export type OutliersReport = {
  ok: boolean;
  team: string | null;
  explore: boolean;
  skipped?: string;
  searches: number;
  units: number;
  stats: number;
  videos: number;
  channels: number;
  scanned: number;
  thumbs: number;
  alerts: number;
  insights: number;
  purged?: unknown;
  note?: string | null;
  ms: number;
};

type CrawlState = {
  searches?: Record<string, string>;
  counts?: { videos: number; channels: number; outliers: number };
  note?: string | null;
  phase?: "new" | "growing" | "steady";
  dirty?: boolean;
  error?: string | null;
};
export type Niche = {
  id: string;
  team_id: string | null;
  slug: string | null;
  name: string;
  keywords: string[];
  exclude_words: string[];
  lang: string | null;
  region: string | null;
  kinds: string[];
  crawl: CrawlState;
  crawled_at: string | null;
  created_at: string;
  insights_at: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

export class Ctx {
  dirty = new Set<string>();
  report: OutliersReport;
  constructor(
    public admin: Admin,
    public yt: YouTube,
    public niches: Niche[],
    public teamId: string | null,
    public explore: boolean,
    public budgets: Budgets,
    public deadline: number,
    public boost: boolean
  ) {
    this.report = { ok: true, team: teamId, explore, searches: 0, units: 0, stats: 0, videos: 0, channels: 0, scanned: 0, thumbs: 0, alerts: 0, insights: 0, ms: 0 };
  }
  /** At least `ms` of the run's time left. */
  left(ms = 0) {
    return Date.now() + ms < this.deadline;
  }
}

/** One run for a team or for the explore niches (see the top of this file). */
export async function runOutliersJob(opts: { team?: unknown; explore?: unknown; niche?: unknown; budgetMs?: number }): Promise<OutliersReport> {
  const started = Date.now();
  const team = typeof opts.team === "string" && UUID.test(opts.team) ? opts.team : null;
  const explore = opts.explore === true && !team;
  const empty = (skipped: string): OutliersReport => ({ ok: true, team, explore, skipped, searches: 0, units: 0, stats: 0, videos: 0, channels: 0, scanned: 0, thumbs: 0, alerts: 0, insights: 0, ms: Date.now() - started });
  if (!team && !explore) return empty("Nothing to collect for.");
  const budgets = readBudgets();
  if (explore && !budgets.explore) return empty("The explore niches are off (OUTLIERS_EXPLORE=0).");
  const admin = createAdminClient();
  const lockKey = team ? `team:${team}` : "explore";
  const budgetMs = Math.min(Math.max(opts.budgetMs ?? 44_000, 5_000), 52_000);
  const { data: got } = await admin.rpc("outlier_lock", { p_key: lockKey, p_seconds: Math.ceil(budgetMs / 1000) + 10 });
  if (got === false) return empty("Another run is collecting for this team right now.");
  try {
    if (explore) await ensureExplore(admin);
    const { data: rows } = await (team ? admin.from("outlier_niches").select("*").eq("team_id", team) : admin.from("outlier_niches").select("*").is("team_id", null));
    const niches = ((rows ?? []) as Niche[]).map((n) => ({ ...n, crawl: (n.crawl ?? {}) as CrawlState }));
    const { count: tracked } = team ? await admin.from("outlier_tracked").select("channel_id", { count: "exact", head: true }).eq("team_id", team) : { count: 0 };
    if (!niches.length && !tracked) return empty("No niches or tracked channels yet.");

    const access = await outliersAccess(team);
    if (!access) {
      await noteAll(admin, niches, "no-access");
      return { ...empty("No way to read YouTube: connect the team's YouTube channel or set YOUTUBE_API_KEY."), note: "no-access" };
    }

    const { data: usedRaw } = await admin.rpc("outlier_quota_today");
    const used = (usedRaw ?? {}) as Partial<Record<Bucket, number>>;
    const hours = hoursIntoQuotaDay();
    const focus = typeof opts.niche === "string" && UUID.test(opts.niche) ? opts.niche : null;
    const boost = !!focus || niches.some((n) => !n.crawled_at || Date.parse(n.created_at) > Date.now() - DAY);
    const unitCap = Math.floor(budgets.units * 0.85);
    const local: Record<Bucket, number> = {
      search: Math.min(explore ? 2 : boost ? 6 : 3, leftToday(budgets.crawlSearches, used.search ?? 0, hours, boost)),
      units: Math.min(explore ? 260 : boost ? 900 : 450, leftToday(unitCap, used.units ?? 0, hours, boost)),
      stats: Math.min(500, leftToday(budgets.stats, used.stats ?? 0, hours, true)),
    };
    const sp = spender(admin, { search: budgets.crawlSearches, units: unitCap, stats: budgets.stats }, local);
    const yt = new YouTube(access, sp);
    // The focused niche first, then the ones waiting longest.
    niches.sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : (a.crawled_at ?? "").localeCompare(b.crawled_at ?? "")));
    const ctx = new Ctx(admin, yt, niches, team, explore, budgets, started + budgetMs, boost);

    const step = async (name: string, fn: () => Promise<void>) => {
      if (!ctx.left(1500)) return;
      try {
        await fn();
      } catch (e) {
        if (e instanceof QuotaError) {
          ctx.report.note = e.exhausted ? "quota" : ctx.report.note ?? null;
          return;
        }
        ctx.report.ok = false;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[outliers ${lockKey}] ${name}:`, msg);
        ctx.report.note = `${name}: ${msg}`.slice(0, 300);
      }
    };

    if (team) await step("repair", () => repairMissing(ctx));
    for (const n of niches) await step("searches", () => seedSearches(ctx, n, n.id === focus));
    await step("channels", () => scanChannels(ctx));
    for (const n of niches.slice(0, 4)) await step("featured", () => expandFeatured(ctx, n));
    await step("numbers", () => refreshVideos(ctx));
    await step("thumbnails", () => analyzeThumbs(ctx));
    if (team) await step("alerts", () => sendAlerts(ctx));
    if (explore) {
      await step("formats", () => redetectFormats(ctx));
      await step("purge", async () => {
        const { data } = await admin.rpc("outliers_purge", { p_stats_days: budgets.statsDays });
        ctx.report.purged = data;
      });
    }
    await step("insights", () => rebuildInsights(ctx));

    // What each niche looks like now (the page shows it).
    const note = ctx.report.note === "quota" ? "quota" : null;
    for (const n of niches) {
      const crawl: CrawlState = { ...n.crawl, note, error: ctx.report.ok ? null : ctx.report.note ?? null };
      await admin.from("outlier_niches").update({ crawl, crawled_at: new Date().toISOString() }).eq("id", n.id);
    }
    ctx.report.searches = yt.calls.search;
    ctx.report.units = yt.calls.units;
    ctx.report.stats = yt.calls.stats;
    ctx.report.ms = Date.now() - started;
    return ctx.report;
  } finally {
    await admin.rpc("outlier_unlock", { p_key: lockKey });
  }
}

/**
 * A context for one request outside the timer (a live search, adding a
 * channel): no niches of its own, `ms` of time.
 */
export function requestCtx(admin: Admin, yt: YouTube, teamId: string | null, niches: Niche[] = [], ms = 20_000): Ctx {
  return new Ctx(admin, yt, niches, teamId, false, readBudgets(), Date.now() + ms, true);
}

async function noteAll(admin: Admin, niches: Niche[], note: string) {
  for (const n of niches) await admin.from("outlier_niches").update({ crawl: { ...n.crawl, note } }).eq("id", n.id);
}

/** The built-in explore niches exist, with the code's names and keywords. */
async function ensureExplore(admin: Admin) {
  const { data } = await admin.from("outlier_niches").select("slug, name, keywords, color").is("team_id", null);
  const have = new Map(((data ?? []) as { slug: string; name: string; keywords: string[]; color: string }[]).map((r) => [r.slug, r]));
  const rows = EXPLORE.filter((e) => {
    const h = have.get(e.slug);
    return !h || h.name !== e.name || h.color !== e.color || h.keywords.join("|") !== e.keywords.join("|");
  }).map((e, i) => ({ slug: e.slug, name: e.name, color: e.color, keywords: e.keywords, team_id: null, position: i }));
  if (rows.length) await admin.from("outlier_niches").upsert(rows, { onConflict: "slug" });
}

// ---------------------------------------------------------------------------
// Saving YouTube's answers
// ---------------------------------------------------------------------------

async function upsertRows(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 400), { onConflict });
    if (error) throw new Error(`Saving ${table}: ${error.message}`);
  }
}

/** Channels' rows exist and are fresh (read again after 20 days). Returns the ids that exist. */
export async function ensureChannels(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Set();
  const have = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await ctx.admin.from("yt_channels").select("id, fetched_at").in("id", uniq.slice(i, i + 300));
    for (const r of (data ?? []) as { id: string; fetched_at: string }[]) have.set(r.id, r.fetched_at);
  }
  const stale = uniq.filter((id) => !have.has(id) || Date.parse(have.get(id)!) < Date.now() - 20 * DAY);
  if (stale.length) {
    const items = await ctx.yt.channels(stale);
    const rows = items.map((c) => channelRow(c)).filter((r): r is NonNullable<typeof r> => !!r);
    await upsertRows(ctx.admin, "yt_channels", rows, "id");
    ctx.report.channels += rows.length;
    for (const r of rows) have.set(r.id, r.fetched_at);
  }
  return new Set(have.keys());
}

/**
 * Reads videos and saves them (their channels first); notes a changed title.
 * `hints`: the list each came from ("short" / "long"); `keepKind`: their
 * stored kind stays (a refresh). Returns the rows saved.
 */
export async function ingestVideos(ctx: Ctx, ids: string[], o: { player?: boolean; hints?: Map<string, "short" | "long">; keepKind?: Map<string, "short" | "long" | "live"> } = {}): Promise<VideoRow[]> {
  if (!ids.length) return [];
  const items = await ctx.yt.videos(ids, o.player ?? false);
  const rows: VideoRow[] = [];
  for (const it of items) {
    const kept = it.id ? o.keepKind?.get(it.id) : undefined;
    const hint = it.id ? o.hints?.get(it.id) ?? (kept === "short" || kept === "long" ? kept : null) : null;
    const r = videoRow(it, hint);
    if (!r) continue;
    if (kept === "live") r.kind = "live";
    rows.push(r);
  }
  if (!rows.length) return [];
  const known = await ensureChannels(ctx, rows.map((r) => r.channel_id));
  const ok = rows.filter((r) => known.has(r.channel_id));
  // A title changed since it was last read: kept for its page (30 days).
  const old = new Map<string, { title: string; views: number | null }>();
  for (let i = 0; i < ok.length; i += 300) {
    const { data } = await ctx.admin.from("yt_videos").select("id, title, views").in("id", ok.slice(i, i + 300).map((r) => r.id));
    for (const r of (data ?? []) as { id: string; title: string; views: number | null }[]) old.set(r.id, r);
  }
  const changes = ok.filter((r) => old.has(r.id) && old.get(r.id)!.title && old.get(r.id)!.title !== r.title).map((r) => ({ video_id: r.id, field: "title", before: old.get(r.id)!.title, after: r.title, views: old.get(r.id)!.views }));
  await upsertRows(ctx.admin, "yt_videos", ok, "id");
  if (changes.length) await ctx.admin.from("yt_video_changes").insert(changes);
  ctx.report.videos += ok.length;
  return ok;
}

// ---------------------------------------------------------------------------
// 1. Searches
// ---------------------------------------------------------------------------

async function seedSearches(ctx: Ctx, n: Niche, focused: boolean) {
  if (!n.keywords.length) return;
  const per = ctx.explore ? 1 : focused || !n.crawled_at ? 3 : 1;
  const due = dueSearches(n).slice(0, per);
  const kinds = n.kinds ?? ["long", "short"];
  for (const d of due) {
    if (!ctx.left(6000)) return;
    const publishedAfter = d.task.days ? new Date(Date.now() - d.task.days * DAY).toISOString() : undefined;
    const { ids } = await ctx.yt.search({
      q: d.kw,
      order: d.task.order,
      publishedAfter,
      videoDuration: kinds.length === 1 && kinds[0] === "short" ? "short" : undefined,
      relevanceLanguage: n.lang,
      regionCode: n.region,
    });
    n.crawl = { ...n.crawl, searches: { ...(n.crawl.searches ?? {}), [d.key]: new Date().toISOString() } };
    await ctx.admin.from("outlier_niches").update({ crawl: n.crawl }).eq("id", n.id);
    if (!ids.length) continue;
    const rows = await ingestVideos(ctx, ids, { player: true });
    const words = (n.exclude_words ?? []).map((w) => w.toLowerCase());
    const kept = rows.filter((r) => r.kind !== "live" && kinds.includes(r.kind) && !words.some((w) => r.title.toLowerCase().includes(w)));
    if (kept.length) {
      await ctx.admin.from("outlier_niche_hits").upsert(kept.map((r) => ({ niche_id: n.id, video_id: r.id })), { onConflict: "niche_id,video_id", ignoreDuplicates: true });
      await addChannels(ctx, n, [...new Set(kept.map((r) => r.channel_id))], "search");
      ctx.dirty.add(n.id);
    }
  }
}

const MAX_CHANNELS = { team: 400, explore: 40 };

/** New channels join a niche (never past its size limit). */
export async function addChannels(ctx: Ctx, n: Niche, ids: string[], source: "search" | "featured" | "manual" | "seed") {
  if (!ids.length) return;
  // Picked by someone: it counts whatever its relevance, and comes back if it was taken out.
  if (source === "manual") {
    await ctx.admin.from("outlier_niche_channels").upsert(ids.map((channel_id) => ({ niche_id: n.id, team_id: n.team_id, channel_id, source, hidden: false })), { onConflict: "niche_id,channel_id" });
    return;
  }
  const { count } = await ctx.admin.from("outlier_niche_channels").select("channel_id", { count: "exact", head: true }).eq("niche_id", n.id);
  const room = (n.team_id ? MAX_CHANNELS.team : MAX_CHANNELS.explore) - (count ?? 0);
  if (room <= 0) return;
  const { data: existing } = await ctx.admin.from("outlier_niche_channels").select("channel_id").eq("niche_id", n.id).in("channel_id", ids);
  const have = new Set(((existing ?? []) as { channel_id: string }[]).map((r) => r.channel_id));
  const fresh = ids.filter((id) => !have.has(id)).slice(0, Math.max(0, room));
  if (!fresh.length) return;
  await ctx.admin.from("outlier_niche_channels").insert(fresh.map((channel_id) => ({ niche_id: n.id, team_id: n.team_id, channel_id, source })));
}

// ---------------------------------------------------------------------------
// 2. Channels
// ---------------------------------------------------------------------------

async function scanChannels(ctx: Ctx) {
  const limit = ctx.explore ? 12 : ctx.boost ? 30 : 20;
  const { data } = await ctx.admin.rpc("outliers_due_channels", { p_team: ctx.teamId, p_limit: limit });
  const due = ((data ?? []) as { channel_id: string; reason: string }[]).map((r) => r.channel_id);
  if (!due.length) return;
  const known = await ensureChannels(ctx, due);
  // Which niches each channel is in (its relevance per niche, and which kinds to read).
  const { data: links } = await ctx.admin.from("outlier_niche_channels").select("niche_id, channel_id").in("channel_id", due);
  const nichesOf = new Map<string, Niche[]>();
  for (const l of (links ?? []) as { niche_id: string; channel_id: string }[]) {
    const n = ctx.niches.find((x) => x.id === l.niche_id);
    if (n) nichesOf.set(l.channel_id, [...(nichesOf.get(l.channel_id) ?? []), n]);
  }
  for (const cid of due) {
    if (!ctx.left(5000)) return;
    if (!known.has(cid)) {
      // Gone from YouTube: out of every niche of this scope, so it isn't asked again.
      await ctx.admin.from("outlier_niche_channels").delete().eq("channel_id", cid).in("niche_id", ctx.niches.map((n) => n.id));
      continue;
    }
    const ns = nichesOf.get(cid) ?? [];
    const kinds = new Set(ns.length ? ns.flatMap((n) => n.kinds ?? ["long", "short"]) : ["long", "short"]);
    await scanChannel(ctx, cid, [...kinds] as ("long" | "short")[], ns);
  }
}

/** One channel: its latest videos of each kind, their scores, the channel's numbers, its relevance per niche. */
export async function scanChannel(ctx: Ctx, cid: string, kinds: ("long" | "short")[], niches: Niche[]) {
  const pl = playlistsOf(cid);
  const max = ctx.explore ? 30 : 50;
  const hints = new Map<string, "short" | "long">();
  let fallback = false;
  const longIds = kinds.includes("long") ? await ctx.yt.playlist(pl.long, max) : [];
  const shortIds = kinds.includes("short") ? await ctx.yt.playlist(pl.shorts, max) : [];
  for (const id of longIds ?? []) hints.set(id, "long");
  for (const id of shortIds ?? []) hints.set(id, "short");
  let ids = [...hints.keys()];
  if (longIds === null && (shortIds === null || !kinds.includes("short"))) {
    // No separate lists for this channel: every upload, told apart by length and shape.
    const all = await ctx.yt.playlist(pl.uploads, max);
    ids = all ?? [];
    fallback = true;
  }
  if (ids.length) await ingestVideos(ctx, ids, { hints, player: fallback });
  await recomputeChannel(ctx, cid, niches);
  ctx.report.scanned++;
  for (const n of niches) ctx.dirty.add(n.id);
}

async function recomputeChannel(ctx: Ctx, cid: string, niches: Niche[]) {
  const { data } = await ctx.admin.from("yt_videos").select("id, kind, published_at, views, title, tags, score, stats_at").eq("channel_id", cid).order("published_at", { ascending: false }).limit(400);
  const vids = (data ?? []) as { id: string; kind: string; published_at: string; views: number | null; title: string; tags: string[] | null; score: number | null; stats_at: string | null }[];
  const nums = channelNumbers(vids.map((v) => ({ id: v.id, kind: v.kind, publishedAt: v.published_at, views: v.views })));
  const now = Date.now();
  const rows = vids.map((v) => {
    const score = nums.scores.get(v.id) ?? null;
    const age = (now - Date.parse(v.published_at)) / 3_600_000;
    return { id: v.id, score, projected: projectedScore(score, v.published_at, now), vph: v.views !== null && age > 0 ? Math.round(v.views / Math.max(1, age)) : null };
  });
  for (let i = 0; i < rows.length; i += 500) await ctx.admin.rpc("outliers_set_scores", { p: rows.slice(i, i + 500) });
  await ctx.admin
    .from("yt_channels")
    .update({ long_median: nums.longMedian === null ? null : Math.round(nums.longMedian), short_median: nums.shortMedian === null ? null : Math.round(nums.shortMedian), long_n: nums.longN, short_n: nums.shortN, uploads_week: nums.uploadsWeek, last_upload_at: nums.lastUpload, scanned_at: new Date().toISOString() })
    .eq("id", cid);
  const recent = vids.filter((v) => v.kind !== "live").slice(0, 60);
  for (const n of niches) {
    const rel = relevanceOf(recent, keywordStems(n.keywords));
    await ctx.admin.rpc("outliers_set_relevance", { p_niche: n.id, p: [{ channel_id: cid, relevance: rel }] });
  }
  // Views over time for the young ones (at most one reading every 10 minutes).
  const at = new Date(Math.floor(now / 600_000) * 600_000).toISOString();
  const young = vids.filter((v) => now - Date.parse(v.published_at) < 7 * DAY && v.views !== null);
  if (young.length) await ctx.admin.from("yt_video_stats").upsert(young.map((v) => ({ video_id: v.id, at, views: v.views })), { onConflict: "video_id,at", ignoreDuplicates: true });
}

// ---------------------------------------------------------------------------
// 3. Featured channels
// ---------------------------------------------------------------------------

async function expandFeatured(ctx: Ctx, n: Niche) {
  const { data: members } = await ctx.admin.from("outlier_niche_channels").select("channel_id, relevance").eq("niche_id", n.id).eq("hidden", false);
  const list = (members ?? []) as { channel_id: string; relevance: number | null }[];
  const relevant = list.filter((m) => (m.relevance ?? 0) >= 0.4);
  if (relevant.length >= (n.team_id ? 120 : 30) || !relevant.length) return;
  const { data: chans } = await ctx.admin.from("yt_channels").select("id, featured_at, subscribers").in("id", relevant.map((r) => r.channel_id));
  const due = ((chans ?? []) as { id: string; featured_at: string | null; subscribers: number | null }[])
    .filter((c) => !c.featured_at || Date.parse(c.featured_at) < Date.now() - 30 * DAY)
    .sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0))
    .slice(0, 2);
  for (const c of due) {
    if (!ctx.left(4000)) return;
    const ids = await ctx.yt.featured(c.id);
    await ctx.admin.from("yt_channels").update({ featured_at: new Date().toISOString() }).eq("id", c.id);
    const fresh = ids.filter((id) => !list.some((m) => m.channel_id === id));
    if (!fresh.length) continue;
    const known = await ensureChannels(ctx, fresh);
    await addChannels(ctx, n, fresh.filter((id) => known.has(id)), "featured");
  }
}

// ---------------------------------------------------------------------------
// 4. Numbers and details
// ---------------------------------------------------------------------------

async function refreshVideos(ctx: Ctx) {
  const { data } = await ctx.admin.rpc("outliers_due_videos", { p_team: ctx.teamId, p_limit: ctx.explore ? 300 : 1000 });
  const due = (data ?? []) as { video_id: string; reason: "details" | "stats" }[];
  if (!due.length) return;
  const details = due.filter((d) => d.reason === "details").map((d) => d.video_id).slice(0, ctx.explore ? 150 : 400);
  const stats = due.filter((d) => d.reason === "stats").map((d) => d.video_id);

  if (details.length) {
    const { data: kinds } = await ctx.admin.from("yt_videos").select("id, kind").in("id", details);
    const keepKind = new Map(((kinds ?? []) as { id: string; kind: "short" | "long" | "live" }[]).map((r) => [r.id, r.kind]));
    for (let i = 0; i < details.length && ctx.left(4000); i += 50) {
      const chunk = details.slice(i, i + 50);
      const rows = await ingestVideos(ctx, chunk, { keepKind });
      // Not on YouTube any more (deleted or private): gone from here too.
      const back = new Set(rows.map((r) => r.id));
      const gone = chunk.filter((id) => !back.has(id));
      if (gone.length) await ctx.admin.from("yt_videos").delete().in("id", gone);
    }
  }
  if (stats.length && ctx.left(4000)) {
    const { data: before } = await ctx.admin.from("yt_videos").select("id, views, score, published_at, stats_at").in("id", stats.slice(0, 1000));
    const prev = new Map(((before ?? []) as { id: string; views: number | null; score: number | null; published_at: string; stats_at: string | null }[]).map((r) => [r.id, r]));
    const fresh = await ctx.yt.stats([...prev.keys()]);
    const now = Date.now();
    const rows: Record<string, unknown>[] = [];
    const snaps: Record<string, unknown>[] = [];
    const at = new Date(Math.floor(now / 600_000) * 600_000).toISOString();
    for (const [id, s] of fresh) {
      const p = prev.get(id);
      if (!p) continue;
      // The channel's usual hasn't moved: the score moves with the views.
      const score = p.score !== null && p.views && s.views !== null ? Math.round(p.score * (s.views / p.views) * 1000) / 1000 : p.score;
      const hoursSince = p.stats_at ? (now - Date.parse(p.stats_at)) / 3_600_000 : 0;
      const vph = s.views !== null && p.views !== null && hoursSince >= 0.25 && hoursSince <= 48 ? Math.max(0, Math.round((s.views - p.views) / hoursSince)) : null;
      rows.push({ id, views: s.views, likes: s.likes, comments: s.comments, score, projected: projectedScore(score, p.published_at, now), vph });
      if (now - Date.parse(p.published_at) < 30 * DAY && s.views !== null) snaps.push({ video_id: id, at, views: s.views, likes: s.likes, comments: s.comments });
    }
    for (let i = 0; i < rows.length; i += 500) await ctx.admin.rpc("outliers_set_stats", { p: rows.slice(i, i + 500) });
    if (snaps.length) await ctx.admin.from("yt_video_stats").upsert(snaps, { onConflict: "video_id,at", ignoreDuplicates: true });
  }
}

/** Saved videos, tracked channels and niche channels whose YouTube data was deleted (or never read): read again. */
async function repairMissing(ctx: Ctx) {
  if (!ctx.teamId) return;
  const [{ data: tracked }, { data: saved }] = await Promise.all([
    ctx.admin.from("outlier_tracked").select("channel_id").eq("team_id", ctx.teamId),
    ctx.admin.from("outlier_saves").select("video_id, channel_id").eq("team_id", ctx.teamId),
  ]);
  const chIds = [...new Set([...((tracked ?? []) as { channel_id: string }[]).map((r) => r.channel_id), ...((saved ?? []) as { channel_id: string | null }[]).map((r) => r.channel_id).filter((x): x is string => !!x)])];
  if (chIds.length) {
    const { data: have } = await ctx.admin.from("yt_channels").select("id").in("id", chIds);
    const missing = chIds.filter((id) => !((have ?? []) as { id: string }[]).some((h) => h.id === id));
    if (missing.length) await ensureChannels(ctx, missing.slice(0, 50));
  }
  const vIds = [...new Set(((saved ?? []) as { video_id: string | null }[]).map((r) => r.video_id).filter((x): x is string => !!x))];
  if (vIds.length) {
    const { data: have } = await ctx.admin.from("yt_videos").select("id").in("id", vIds.slice(0, 1000));
    const missing = vIds.filter((id) => !((have ?? []) as { id: string }[]).some((h) => h.id === id));
    if (missing.length) await ingestVideos(ctx, missing.slice(0, 100), { player: true });
  }
}

// ---------------------------------------------------------------------------
// 5. Thumbnails
// ---------------------------------------------------------------------------

async function thumbOf(id: string, kind: string) {
  const url = kind === "short" ? thumbUrl(id, "hq") : thumbUrl(id, "mq");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 500 || buf.byteLength > 1_500_000) return null;
  const img = decode(buf, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: 2, maxMemoryUsageInMB: 64 });
  const px = { width: img.width, height: img.height, data: img.data, channels: (img.data.length / (img.width * img.height) >= 4 ? 4 : 3) as 3 | 4 };
  return thumbNumbers(px, kind === "short" ? shortCrop(img.width, img.height) : undefined);
}

async function analyzeThumbs(ctx: Ctx) {
  const { data } = await ctx.admin.rpc("outliers_due_thumbs", { p_team: ctx.teamId, p_limit: ctx.explore ? 30 : 60, p_min: ctx.explore ? 1.5 : 0 });
  const due = (data ?? []) as { video_id: string; kind: string }[];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < due.length && ctx.left(3000); i += 6) {
    const batch = due.slice(i, i + 6);
    const done = await Promise.all(
      batch.map(async (d) => {
        try {
          const t = await thumbOf(d.video_id, d.kind);
          return { id: d.video_id, hash: t?.hash ?? null, colors: t?.colors ?? null, lum: t?.lum ?? null, sat: t?.sat ?? null };
        } catch {
          return { id: d.video_id, hash: null, colors: null, lum: null, sat: null };
        }
      })
    );
    rows.push(...done);
  }
  if (rows.length) await ctx.admin.rpc("outliers_set_thumbs", { p: rows });
  ctx.report.thumbs += rows.filter((r) => r.hash).length;
}

// ---------------------------------------------------------------------------
// 6. Alerts and the Monday summary
// ---------------------------------------------------------------------------

type Settings = { alert_min: number; alert_to: "managers" | "everyone" | "off"; watch_words: string[]; digest: boolean; digest_sent_on: string | null };

async function recipients(ctx: Ctx, to: "managers" | "everyone"): Promise<string[]> {
  const { data } = await ctx.admin.from("team_members").select("user_id, member_roles(role)").eq("team_id", ctx.teamId!).eq("status", "active");
  return ((data ?? []) as { user_id: string | null; member_roles: { role: string }[] | null }[])
    .filter((m) => m.user_id && (to === "everyone" || (m.member_roles ?? []).some((r) => r.role === "master" || r.role === "researcher")))
    .map((m) => m.user_id as string);
}

async function sendAlerts(ctx: Ctx) {
  if (!ctx.teamId) return;
  const { data: st } = await ctx.admin.from("outlier_settings").select("alert_min, alert_to, watch_words, digest, digest_sent_on").eq("team_id", ctx.teamId).maybeSingle();
  const s: Settings = { alert_min: 5, alert_to: "managers", watch_words: [], digest: true, digest_sent_on: null, ...((st ?? {}) as Partial<Settings>) };
  const team = await teamMeta(ctx.admin, ctx.teamId);
  if (s.alert_to !== "off") {
    const { data } = await ctx.admin.rpc("outliers_alert_candidates", { p_team: ctx.teamId, p_min: s.alert_min, p_words: s.watch_words });
    const found = (data ?? []) as { video_id: string; channel_id: string; title: string; score: number | null; projected: number | null; views: number | null; why: "tracked" | "word"; word: string | null }[];
    if (found.length) {
      const who = await recipients(ctx, s.alert_to);
      const { data: chans } = await ctx.admin.from("yt_channels").select("id, title, avatar_url").in("id", [...new Set(found.map((f) => f.channel_id))]);
      const ch = new Map(((chans ?? []) as { id: string; title: string; avatar_url: string | null }[]).map((c) => [c.id, c]));
      // Never a flood: the 4 strongest each get their own, the rest one line together.
      const sorted = [...found].sort((a, b) => Math.max(b.score ?? 0, b.projected ?? 0) - Math.max(a.score ?? 0, a.projected ?? 0));
      const top = sorted.slice(0, 4);
      const rest = sorted.slice(4);
      const rows: { recipient_id: string; body: string; kind: string; metadata: Record<string, unknown> }[] = top.flatMap((f) => {
        const mult = multText(Math.max(f.score ?? 0, f.projected ?? 0));
        const heading = (f.projected ?? 0) > (f.score ?? 0);
        const c = ch.get(f.channel_id);
        const body = f.why === "word" ? `“${f.word}”: ${c?.title ?? "A channel"} has a video heading for ${mult}: ${f.title}` : `${c?.title ?? "A tracked channel"} posted a video ${heading ? "heading for" : "at"} ${mult} its usual: ${f.title}`;
        return who.map((uid) => ({
          recipient_id: uid,
          body,
          kind: "outlier_alert",
          metadata: { href: `/outliers?v=${f.video_id}`, team, videoId: f.video_id, title: f.title, channel: c?.title ?? null, channelAvatar: c?.avatar_url ?? null, mult, heading, why: f.why, word: f.word },
        }));
      });
      if (rest.length)
        rows.push(
          ...who.map((uid) => ({
            recipient_id: uid,
            body: `${rest.length} more new outliers in your niches (${team.name})`,
            kind: "outlier_alert",
            metadata: { href: "/outliers?tab=search&sort=projected&days=3", team, count: rest.length, many: true },
          }))
        );
      if (rows.length) await sendNotifications(rows);
      await ctx.admin.from("outlier_alerts").upsert(found.map((f) => ({ team_id: ctx.teamId, video_id: f.video_id, kind: f.why })), { onConflict: "team_id,video_id", ignoreDuplicates: true });
      ctx.report.alerts += top.length + (rest.length ? 1 : 0);
    }
  }
  if (s.digest) await mondaySummary(ctx, s, team);
}

/** Monday from 8 in the team's time zone: the week's best in the team's niches, once. */
async function mondaySummary(ctx: Ctx, s: Settings, team: Awaited<ReturnType<typeof teamMeta>>) {
  const { data: t } = await ctx.admin.from("teams").select("timezone").eq("id", ctx.teamId!).maybeSingle();
  const tz = (t?.timezone as string | null) || "Europe/Bucharest";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  if (get("weekday") !== "Mon" || Number(get("hour")) < 8 || s.digest_sent_on === day) return;
  const teamNiches = ctx.niches.filter((n) => n.team_id);
  if (!teamNiches.length) return;
  const seen = new Map<string, CorpusVideo>();
  for (const n of teamNiches.slice(0, 4)) for (const v of await corpusOf(ctx.admin, n.id, 3000)) seen.set(v.id, v);
  const recent = [...seen.values()].filter((v) => Date.parse(v.publishedAt) > Date.now() - 7 * DAY && (v.score ?? 0) >= 3);
  await ctx.admin.from("outlier_settings").upsert({ team_id: ctx.teamId, digest_sent_on: day }, { onConflict: "team_id" });
  if (!recent.length) return;
  const best = [...recent].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const who = await recipients(ctx, "everyone");
  await sendNotifications(
    who.map((uid) => ({
      recipient_id: uid,
      body: `This week in ${teamNiches.length === 1 ? teamNiches[0].name : "your niches"}: ${recent.length} new outlier${recent.length === 1 ? "" : "s"}, the best at ${multText(best.score)}: ${best.title}`,
      kind: "outlier_digest",
      metadata: { href: `/outliers?v=${best.id}`, team, niche: teamNiches.length === 1 ? teamNiches[0].name : null, count: recent.length, best: { id: best.id, title: best.title, mult: multText(best.score) } },
    }))
  );
}

// ---------------------------------------------------------------------------
// 7. Insights, formats again, the explore niches together
// ---------------------------------------------------------------------------

/** One row of outliers_corpus: [id, channel_id, title, kind, published_at, views, score, duration_s, lang, formats, bits, thumb_colors, thumb_lum, thumb_sat, subscribers]. */
type CorpusRow = [string, string, string, "long" | "short", string, number | null, number | null, number | null, string | null, string[] | null, number | null, string[] | null, number | null, number | null, number | null];
export const toCorpus = (r: CorpusRow): CorpusVideo => ({
  id: r[0],
  channelId: r[1],
  title: r[2],
  kind: r[3],
  publishedAt: r[4],
  views: r[5] === null ? null : Number(r[5]),
  score: r[6],
  durationS: r[7],
  lang: r[8],
  formats: r[9] ?? [],
  bits: r[10] ?? 0,
  colors: r[11],
  lum: r[12],
  sat: r[13],
  subs: r[14] === null ? null : Number(r[14]),
});

/** A niche's videos as the insights read them (null: every explore niche together). */
export async function corpusOf(admin: Admin, nicheId: string | null, limit = 30_000): Promise<CorpusVideo[]> {
  const { data, error } = await admin.rpc("outliers_corpus", { p_niche: nicheId, p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CorpusRow[]).map(toCorpus);
}

/** A niche's insights worked out again from its videos now (also the page's fallback when none were saved yet). */
export async function insightsFor(admin: Admin, nicheId: string | null): Promise<{ insights: ReturnType<typeof buildInsights>; counts: { videos: number; channels: number; outliers: number } }> {
  const corpus = await corpusOf(admin, nicheId);
  const insights = buildInsights(corpus);
  return { insights, counts: { videos: corpus.length, channels: new Set(corpus.map((v) => v.channelId)).size, outliers: corpus.filter((v) => (v.score ?? 0) >= 3).length } };
}

async function rebuildInsights(ctx: Ctx) {
  for (const n of ctx.niches) {
    if (!ctx.left(4000)) return;
    const stale = !n.insights_at || Date.parse(n.insights_at) < Date.now() - 12 * 3_600_000;
    const changed = ctx.dirty.has(n.id) && (!n.insights_at || Date.parse(n.insights_at) < Date.now() - 20 * 60_000);
    if (!stale && !changed) continue;
    const { insights, counts } = await insightsFor(ctx.admin, n.id);
    const phase: CrawlState["phase"] = counts.videos === 0 ? "new" : counts.videos < 1500 ? "growing" : "steady";
    n.crawl = { ...n.crawl, counts, phase, dirty: false };
    await ctx.admin.from("outlier_niches").update({ insights, insights_at: insights.at, crawl: n.crawl }).eq("id", n.id);
    n.insights_at = insights.at;
    ctx.report.insights++;
  }
  // Every explore niche together: the formats and templates "every niche" borrows from.
  if (ctx.explore && ctx.left(6000)) {
    const { data: g } = await ctx.admin.from("outlier_global").select("at").eq("key", "explore").maybeSingle();
    const old = !g || Date.parse((g as { at: string }).at) < Date.now() - 6 * 3_600_000;
    if (old || ctx.dirty.size) {
      const { insights } = await insightsFor(ctx.admin, null);
      await ctx.admin.from("outlier_global").upsert({ key: "explore", insights, at: insights.at }, { onConflict: "key" });
      ctx.report.insights++;
    }
  }
}

async function redetectFormats(ctx: Ctx) {
  const { data } = await ctx.admin.from("yt_videos").select("id, title").lt("fmt_v", FORMAT_VERSION).limit(3000);
  const rows = ((data ?? []) as { id: string; title: string }[]).map((r) => ({ id: r.id, formats: detectFormats(r.title), bits: traitBits(r.title), v: FORMAT_VERSION }));
  for (let i = 0; i < rows.length && ctx.left(2000); i += 1000) await ctx.admin.rpc("outliers_set_formats", { p: rows.slice(i, i + 1000) });
}

export { YtError };
