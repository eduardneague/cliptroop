import "server-only";
import { decode } from "jpeg-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications, teamMeta } from "@/lib/notify";
import { getAccessToken } from "@/lib/social/tokens";
import { daysAgo, num, ytFirst } from "@/modules/analytics/lib/sync-core";
import { hoursIntoQuotaDay, leftToday, readBudgets, type Budgets } from "./budget";
import { EXPLORE, EXPLORE_BY_SLUG, SEED_MIN_SUBS } from "./explore";
import { channelProfile, FIT_VERSION, fitOf, keywordHit, namedBy, nicheLangs, nicheProfile, sampleOf, teamLanguage, videoFits, type ChannelProfile, type FitPrefs, type NicheProfile, type Sample } from "./fit";
import { detectFormats, FORMAT_VERSION, traitBits } from "./formats";
import { channelRow, playlistsOf, thumbUrl, VIDEO_ID, videoRow, type VideoRow } from "./ingest";
import { buildInsights } from "./insights";
import { channelNumbers, multText, projectedScore } from "./scores";
import { dueSearches, keywordStems } from "./plan";
import { shortCrop, thumbNumbers } from "./thumb-math";
import { outliersAccess, QuotaError, spender, YouTube, YtError, type Bucket } from "./youtube";
import { hash, type CorpusVideo } from "./corpus";

/*
 * The collector (1.27.0, reworked in 1.29.0): keeps every niche full of
 * scored videos from channels that really belong in it, within YouTube's
 * budget. Called every 30 minutes by the timer, once per team that follows a
 * niche or tracks a channel and once for the explore niches ({"job":
 * "outliers"} → /api/cron/posting), right after a niche is added or changed,
 * and when someone opens an explore niche that's still empty.
 *
 * One run, until its time is up (each step saves what it did):
 *   1. explore niches: their seed channels (well-known ones, by @handle);
 *   2. searches: each niche keyword × a few windows; a video found counts
 *      only when it fits the niche (language, where it's from, made for kids,
 *      the keyword in its title) and only those bring their channel in; a
 *      keyword that is a channel's name ("mkbhd") makes that channel one of
 *      the niche's own and isn't searched again;
 *   3. channels: their latest long videos and Shorts (two lists, 50 a page;
 *      a niche's own channels and tracked ones get 150 long videos the first
 *      time), every video's score against the channel's usual, the channel's
 *      usual, how often it posts, and its profile (languages, categories,
 *      made for kids, where it's from, its words). At most half the run;
 *   4. fit: which found channels belong in each niche (fit.ts), worked out
 *      from their profiles and the niche's own words; all of them again when
 *      the niche's keywords, languages, countries or own channels change;
 *   5. featured channels of the niche's own channels (and the best found ones);
 *   6. numbers: young videos every 2 hours, tracked and saved ones daily,
 *      every video's details before YouTube's 30 days run out;
 *   7. thumbnails; 8. alerts and the Monday summary (teams);
 *   9. the channels the team's viewers also watch (daily, from the team's
 *      own YouTube Analytics: the videos YouTube suggested theirs next to);
 *  10. insights for every niche that changed.
 * The explore run also works out older videos' formats again when the
 * detectors changed, and deletes what YouTube's 30 days say must go.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
/** A niche's own channels: picked by someone, built in, or named by a keyword. They always count. */
export const GROUP_SOURCES = new Set(["manual", "seed", "audience"]);
/** The explore niches are for English-speaking teams first (1.29.0): found channels must be English and not for kids. */
const EXPLORE_PREFS: FitPrefs = { langs: ["en"], regions: [], kids: false };

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
  fitted: number;
  seeds: number;
  thumbs: number;
  alerts: number;
  audience: number;
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
  /** Explore: a seed's @handle → its channel id, or "skip" (1.29.0). */
  seeds?: Record<string, string>;
  /** A keyword → the channel it names (1.29.0). */
  named?: Record<string, string>;
  /** The team's own language and when it was worked out (for niches that didn't pick one). */
  team_lang?: string | null;
  team_lang_at?: string;
  /** What the last full fit was for, its version and when (1.29.0). */
  fit_key?: string;
  fit_v?: number;
  fit_at?: string;
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
  // 1.29.0 (undefined before migration 0094)
  langs?: string[] | null;
  regions?: string[] | null;
  only_group?: boolean;
  kids?: boolean;
  profile?: NicheProfile | null;
  profile_at?: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

export class Ctx {
  dirty = new Set<string>();
  /** Channels read this run (their profile is fresh, their fit is due). */
  scanned = new Set<string>();
  report: OutliersReport;
  /** The team's own language (niches that didn't pick one count it). */
  teamLang: string | null = null;
  constructor(
    public admin: Admin,
    public yt: YouTube,
    public niches: Niche[],
    public teamId: string | null,
    public explore: boolean,
    public budgets: Budgets,
    public deadline: number,
    public boost: boolean,
    public focus: string | null = null
  ) {
    this.report = { ok: true, team: teamId, explore, searches: 0, units: 0, stats: 0, videos: 0, channels: 0, scanned: 0, fitted: 0, seeds: 0, thumbs: 0, alerts: 0, audience: 0, insights: 0, ms: 0 };
  }
  /** At least `ms` of the run's time left. */
  left(ms = 0) {
    return Date.now() + ms < this.deadline;
  }
}

/** What counts in a niche: its languages (its own, else the team's), where its creators are from, made for kids. */
export function prefsOf(ctx: Pick<Ctx, "teamLang" | "explore">, n: Niche): FitPrefs {
  if (!n.team_id) return EXPLORE_PREFS;
  return { langs: nicheLangs(n.langs ?? null, ctx.teamLang ?? n.crawl.team_lang ?? null), regions: n.regions ?? [], kids: !!n.kids };
}

const emptyReport = (team: string | null, explore: boolean, skipped: string, started: number): OutliersReport => ({
  ok: true,
  team,
  explore,
  skipped,
  searches: 0,
  units: 0,
  stats: 0,
  videos: 0,
  channels: 0,
  scanned: 0,
  fitted: 0,
  seeds: 0,
  thumbs: 0,
  alerts: 0,
  audience: 0,
  insights: 0,
  ms: Date.now() - started,
});

/** One run for a team or for the explore niches (see the top of this file). `niche`: that one first (a new niche, or an explore niche someone opened). */
export async function runOutliersJob(opts: { team?: unknown; explore?: unknown; niche?: unknown; budgetMs?: number }): Promise<OutliersReport> {
  const started = Date.now();
  const team = typeof opts.team === "string" && UUID.test(opts.team) ? opts.team : null;
  const explore = opts.explore === true && !team;
  if (!team && !explore) return emptyReport(team, explore, "Nothing to collect for.", started);
  const budgets = readBudgets();
  if (explore && !budgets.explore) return emptyReport(team, explore, "The explore niches are off (OUTLIERS_EXPLORE=0).", started);
  const admin = createAdminClient();
  const lockKey = team ? `team:${team}` : "explore";
  const budgetMs = Math.min(Math.max(opts.budgetMs ?? 44_000, 5_000), 52_000);
  const { data: got } = await admin.rpc("outlier_lock", { p_key: lockKey, p_seconds: Math.ceil(budgetMs / 1000) + 10 });
  if (got === false) return emptyReport(team, explore, "Another run is collecting for this team right now.", started);
  try {
    if (explore) await ensureExplore(admin);
    const { data: rows } = await (team ? admin.from("outlier_niches").select("*").eq("team_id", team) : admin.from("outlier_niches").select("*").is("team_id", null));
    const niches = ((rows ?? []) as Niche[]).map((n) => ({ ...n, crawl: (n.crawl ?? {}) as CrawlState }));
    const { count: tracked } = team ? await admin.from("outlier_tracked").select("channel_id", { count: "exact", head: true }).eq("team_id", team) : { count: 0 };
    if (!niches.length && !tracked) return emptyReport(team, explore, "No niches or tracked channels yet.", started);

    const access = await outliersAccess(team);
    if (!access) {
      await noteAll(admin, niches, "no-access");
      return { ...emptyReport(team, explore, "No way to read YouTube: connect the team's YouTube channel or set YOUTUBE_API_KEY.", started), note: "no-access" };
    }

    const { data: usedRaw } = await admin.rpc("outlier_quota_today");
    const used = (usedRaw ?? {}) as Partial<Record<string, number>>;
    const hours = hoursIntoQuotaDay();
    const focus = typeof opts.niche === "string" && UUID.test(opts.niche) && niches.some((n) => n.id === opts.niche) ? (opts.niche as string) : null;
    const boost = !!focus || niches.some((n) => !n.crawled_at || Date.parse(n.created_at) > Date.now() - DAY);
    const unitCap = Math.floor(budgets.units * 0.85);
    // The explore niches spend their own budgets (1.29.0); teams the rest.
    const caps: Record<Bucket, number> = explore
      ? { search: budgets.exploreSearches, units: budgets.exploreUnits, stats: budgets.stats }
      : { search: Math.max(0, budgets.crawlSearches - budgets.exploreSearches), units: Math.max(0, unitCap - budgets.exploreUnits), stats: budgets.stats };
    const usedOf = (b: Bucket) => (explore && b === "units" ? used.xunits : explore && b === "search" ? used.xsearch : used[b]) ?? 0;
    const local: Record<Bucket, number> = {
      search: Math.min(explore ? 2 : boost ? 6 : 3, leftToday(caps.search, usedOf("search"), hours, boost)),
      units: Math.min(explore ? (focus ? 420 : 300) : boost ? 900 : 450, leftToday(caps.units, usedOf("units"), hours, boost)),
      stats: Math.min(500, leftToday(caps.stats, usedOf("stats"), hours, true)),
    };
    const sp = spender(admin, caps, local, { explore });
    const yt = new YouTube(access, sp);
    // The focused niche first, then the ones waiting longest.
    niches.sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : (a.crawled_at ?? "").localeCompare(b.crawled_at ?? "")));
    const ctx = new Ctx(admin, yt, niches, team, explore, budgets, started + budgetMs, boost, focus);

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

    if (team) {
      await step("language", () => teamLang(ctx));
      await step("repair", () => repairMissing(ctx));
    }
    if (explore) await step("seeds", () => seedExplore(ctx));
    for (const n of niches) await step("searches", () => seedSearches(ctx, n, n.id === focus));
    await step("channels", () => scanChannels(ctx));
    await step("fit", () => fitNiches(ctx));
    for (const n of niches.slice(0, 4)) await step("featured", () => expandFeatured(ctx, n));
    await step("numbers", () => refreshVideos(ctx));
    await step("thumbnails", () => analyzeThumbs(ctx));
    if (team) {
      await step("alerts", () => sendAlerts(ctx));
      await step("audience", () => buildAudience(ctx));
    }
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
  }).map((e) => ({ slug: e.slug, name: e.name, color: e.color, keywords: e.keywords, team_id: null, position: EXPLORE.indexOf(e) }));
  if (rows.length) await admin.from("outlier_niches").upsert(rows, { onConflict: "slug" });
}

/** The language most of the team's own YouTube titles are in (worked out weekly, kept on its niches). */
async function teamLang(ctx: Ctx) {
  const cached = ctx.niches.find((n) => n.crawl.team_lang_at && Date.parse(n.crawl.team_lang_at) > Date.now() - 7 * DAY);
  if (cached) {
    ctx.teamLang = cached.crawl.team_lang ?? null;
    return;
  }
  const { data } = await ctx.admin.from("analytics_content").select("title").eq("team_id", ctx.teamId!).eq("platform", "youtube").order("views", { ascending: false }).limit(150);
  const lang = teamLanguage(((data ?? []) as { title: string | null }[]).map((r) => r.title ?? "").filter(Boolean));
  ctx.teamLang = lang;
  const at = new Date().toISOString();
  for (const n of ctx.niches) n.crawl = { ...n.crawl, team_lang: lang, team_lang_at: at };
}

// ---------------------------------------------------------------------------
// Saving YouTube's answers
// ---------------------------------------------------------------------------

/** Columns added later (a database without them yet still takes the rest). */
const NEWER_COLUMNS: Record<string, string[]> = { yt_videos: ["lang_region"] };

async function upsertRows(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 400) {
    let chunk = rows.slice(i, i + 400);
    let { error } = await admin.from(table).upsert(chunk, { onConflict });
    const newer = NEWER_COLUMNS[table] ?? [];
    if (error && newer.some((c) => error!.message.includes(c))) {
      chunk = chunk.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !newer.includes(k))));
      ({ error } = await admin.from(table).upsert(chunk, { onConflict }));
    }
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

const rowSample = (r: VideoRow): Sample => ({ title: r.title, tags: r.tags, category: r.category, lang: r.lang, langRegion: r.lang_region ?? null, kids: r.kids, kind: r.kind, publishedAt: r.published_at });

// ---------------------------------------------------------------------------
// 1. The explore niches' seed channels
// ---------------------------------------------------------------------------

/** Each explore niche's well-known channels, by @handle (the focused one first, then the ones with the fewest). */
async function seedExplore(ctx: Ctx) {
  const pending = (n: Niche) => (EXPLORE_BY_SLUG.get(n.slug ?? "")?.seeds ?? []).filter((h) => !(n.crawl.seeds ?? {})[h]).length;
  const order = [...ctx.niches].filter((n) => pending(n) > 0).sort((a, b) => (a.id === ctx.focus ? -1 : b.id === ctx.focus ? 1 : Object.keys(a.crawl.seeds ?? {}).length - Object.keys(b.crawl.seeds ?? {}).length));
  for (const n of order) {
    if (!ctx.left(5000)) return;
    const spec = EXPLORE_BY_SLUG.get(n.slug ?? "");
    if (!spec) continue;
    const seeds = { ...(n.crawl.seeds ?? {}) };
    // A few at a time for the others, all of them for the one someone's looking at.
    const todo = spec.seeds.filter((h) => !seeds[h]).slice(0, n.id === ctx.focus ? 30 : 6);
    const added: string[] = [];
    for (const h of todo) {
      if (!ctx.left(3500)) break;
      const item = await ctx.yt.channelByHandle(h);
      const row = item ? channelRow(item) : null;
      if (!row || (row.subscribers ?? 0) < SEED_MIN_SUBS) {
        seeds[h] = "skip";
        continue;
      }
      await upsertRows(ctx.admin, "yt_channels", [row], "id");
      seeds[h] = row.id;
      added.push(row.id);
    }
    if (added.length) {
      await addChannels(ctx, n, added, "seed");
      ctx.report.seeds += added.length;
      ctx.dirty.add(n.id);
    }
    n.crawl = { ...n.crawl, seeds };
    await ctx.admin.from("outlier_niches").update({ crawl: n.crawl }).eq("id", n.id);
  }
}

// ---------------------------------------------------------------------------
// 2. Searches
// ---------------------------------------------------------------------------

/** The country to search YouTube from: the niche's own, else the US when its creators may be from there. */
const searchRegion = (n: Niche, prefs: FitPrefs) => n.region ?? (prefs.regions.includes("US") ? "US" : prefs.regions[0] ?? null);

async function seedSearches(ctx: Ctx, n: Niche, focused: boolean) {
  // Only its own channels count: nothing to look for.
  if (!n.keywords.length || n.only_group) return;
  const named = n.crawl.named ?? {};
  const per = ctx.explore ? 1 : focused || !n.crawled_at ? 3 : 1;
  // A keyword that turned out to be a channel's name isn't searched again (its channel is in the niche).
  const due = dueSearches({ ...n, keywords: n.keywords.filter((k) => !named[k]) }).slice(0, per);
  const kinds = n.kinds ?? ["long", "short"];
  const prefs = prefsOf(ctx, n);
  for (const d of due) {
    if (!ctx.left(6000)) return;
    const publishedAfter = d.task.days ? new Date(Date.now() - d.task.days * DAY).toISOString() : undefined;
    const { ids } = await ctx.yt.search({
      q: d.kw,
      order: d.task.order,
      publishedAfter,
      videoDuration: kinds.length === 1 && kinds[0] === "short" ? "short" : undefined,
      relevanceLanguage: prefs.langs[0] ?? n.lang,
      regionCode: searchRegion(n, prefs),
    });
    n.crawl = { ...n.crawl, searches: { ...(n.crawl.searches ?? {}), [d.key]: new Date().toISOString() } };
    await ctx.admin.from("outlier_niches").update({ crawl: n.crawl }).eq("id", n.id);
    if (!ids.length) continue;
    const rows = await ingestVideos(ctx, ids, { player: true });
    const words = (n.exclude_words ?? []).map((w) => w.toLowerCase());
    const kept = rows.filter((r) => r.kind !== "live" && kinds.includes(r.kind) && !words.some((w) => r.title.toLowerCase().includes(w)));
    if (!kept.length) continue;
    // Channels a keyword names join as the niche's own (and that keyword isn't searched again).
    const chanIds = [...new Set(kept.map((r) => r.channel_id))];
    const { data: chans } = await ctx.admin.from("yt_channels").select("id, title, handle, country").in("id", chanIds);
    const info = new Map(((chans ?? []) as { id: string; title: string; handle: string | null; country: string | null }[]).map((c) => [c.id, c]));
    const own: string[] = [];
    for (const c of info.values()) {
      const k = namedBy(n.keywords, c);
      if (k) {
        own.push(c.id);
        n.crawl = { ...n.crawl, named: { ...(n.crawl.named ?? {}), [k]: c.id } };
      }
    }
    if (own.length) await addChannels(ctx, n, own, "seed");
    // Every video found is kept as a hit with whether it fits; only fitting ones bring their channel in.
    const hits = kept.map((r) => ({ niche_id: n.id, video_id: r.id, ok: own.includes(r.channel_id) || videoFits(rowSample(r), { keywords: n.keywords, prefs, channelCountry: info.get(r.channel_id)?.country ?? null }) }));
    let { error } = await ctx.admin.from("outlier_niche_hits").upsert(hits, { onConflict: "niche_id,video_id" });
    if (error && /\bok\b/.test(error.message)) ({ error } = await ctx.admin.from("outlier_niche_hits").upsert(hits.map(({ ok: _ok, ...h }) => h), { onConflict: "niche_id,video_id", ignoreDuplicates: true }));
    const fitting = [...new Set(kept.filter((r, i) => hits[i].ok && !own.includes(r.channel_id)).map((r) => r.channel_id))];
    if (fitting.length) await addChannels(ctx, n, fitting, "search");
    ctx.dirty.add(n.id);
  }
}

const MAX_CHANNELS = { team: 400, explore: 40 };

/**
 * Channels join a niche. Its own (picked, built in, named by a keyword) are
 * always added (and come back if they were taken out, unless a seed was
 * taken out on purpose); found ones never past the niche's size limit.
 */
export async function addChannels(ctx: Ctx, n: Niche, ids: string[], source: "search" | "featured" | "manual" | "seed" | "audience", by: string | null = null) {
  if (!ids.length) return;
  if (source === "manual" || source === "audience") {
    const rows = ids.map((channel_id) => ({ niche_id: n.id, team_id: n.team_id, channel_id, source, hidden: false, ...(by ? { added_by: by } : {}) }));
    let { error } = await ctx.admin.from("outlier_niche_channels").upsert(rows, { onConflict: "niche_id,channel_id" });
    // Before 0094: no "audience" source and no added_by.
    if (error) ({ error } = await ctx.admin.from("outlier_niche_channels").upsert(rows.map((r) => ({ niche_id: r.niche_id, team_id: r.team_id, channel_id: r.channel_id, source: "manual", hidden: false })), { onConflict: "niche_id,channel_id" }));
    if (error) throw new Error(`Adding channels: ${error.message}`);
    return;
  }
  const { data: existing } = await ctx.admin.from("outlier_niche_channels").select("channel_id, source, hidden").eq("niche_id", n.id).in("channel_id", ids);
  const have = new Map(((existing ?? []) as { channel_id: string; source: string; hidden: boolean }[]).map((r) => [r.channel_id, r]));
  if (source === "seed") {
    // Built in or named by a keyword: one of the niche's own, unless someone took it out.
    const upgrade = ids.filter((id) => have.has(id) && !have.get(id)!.hidden && !GROUP_SOURCES.has(have.get(id)!.source));
    for (const id of upgrade) await ctx.admin.from("outlier_niche_channels").update({ source: "seed" }).eq("niche_id", n.id).eq("channel_id", id);
    const fresh = ids.filter((id) => !have.has(id));
    if (fresh.length) await ctx.admin.from("outlier_niche_channels").insert(fresh.map((channel_id) => ({ niche_id: n.id, team_id: n.team_id, channel_id, source })));
    return;
  }
  const { count } = await ctx.admin.from("outlier_niche_channels").select("channel_id", { count: "exact", head: true }).eq("niche_id", n.id);
  const room = (n.team_id ? MAX_CHANNELS.team : MAX_CHANNELS.explore) - (count ?? 0);
  if (room <= 0) return;
  const fresh = ids.filter((id) => !have.has(id)).slice(0, Math.max(0, room));
  if (!fresh.length) return;
  await ctx.admin.from("outlier_niche_channels").insert(fresh.map((channel_id) => ({ niche_id: n.id, team_id: n.team_id, channel_id, source })));
}

// ---------------------------------------------------------------------------
// 3. Channels
// ---------------------------------------------------------------------------

async function scanChannels(ctx: Ctx) {
  const limit = ctx.explore ? 24 : ctx.boost ? 30 : 20;
  // At most half of what's left: the fit and the rest need their turn.
  const until = Date.now() + Math.max(8_000, (ctx.deadline - Date.now()) * 0.5);
  const due: { id: string; reason: string }[] = [];
  // An explore niche someone opened: its channels not read yet go first.
  if (ctx.focus) {
    const { data: members } = await ctx.admin.from("outlier_niche_channels").select("channel_id, source").eq("niche_id", ctx.focus).eq("hidden", false).limit(200);
    const ids = ((members ?? []) as { channel_id: string; source: string }[]).map((m) => m.channel_id);
    if (ids.length) {
      const { data: seen } = await ctx.admin.from("yt_channels").select("id, scanned_at").in("id", ids);
      const scanned = new Set(((seen ?? []) as { id: string; scanned_at: string | null }[]).filter((c) => c.scanned_at).map((c) => c.id));
      for (const m of (members ?? []) as { channel_id: string; source: string }[]) if (!scanned.has(m.channel_id)) due.push({ id: m.channel_id, reason: GROUP_SOURCES.has(m.source) ? "group" : "niche" });
    }
  }
  const { data } = await ctx.admin.rpc("outliers_due_channels", { p_team: ctx.teamId, p_limit: limit });
  for (const r of (data ?? []) as { channel_id: string; reason: string }[]) if (!due.some((d) => d.id === r.channel_id)) due.push({ id: r.channel_id, reason: r.reason });
  if (!due.length) return;
  const list = due.slice(0, limit + 10);
  const known = await ensureChannels(ctx, list.map((d) => d.id));
  // Which niches each channel is in (and which kinds to read).
  const { data: links } = await ctx.admin.from("outlier_niche_channels").select("niche_id, channel_id").in("channel_id", list.map((d) => d.id));
  const nichesOf = new Map<string, Niche[]>();
  for (const l of (links ?? []) as { niche_id: string; channel_id: string }[]) {
    const n = ctx.niches.find((x) => x.id === l.niche_id);
    if (n) nichesOf.set(l.channel_id, [...(nichesOf.get(l.channel_id) ?? []), n]);
  }
  const { data: depths } = await ctx.admin.from("yt_channels").select("id, scan_depth").in("id", list.map((d) => d.id));
  const depthOf = new Map(((depths ?? []) as { id: string; scan_depth: number | null }[]).map((r) => [r.id, r.scan_depth ?? 0]));
  for (const d of list) {
    if (!ctx.left(5000) || Date.now() > until) return;
    if (!known.has(d.id)) {
      // Gone from YouTube: out of every niche of this scope, so it isn't asked again.
      await ctx.admin.from("outlier_niche_channels").delete().eq("channel_id", d.id).in("niche_id", ctx.niches.map((n) => n.id));
      continue;
    }
    const ns = nichesOf.get(d.id) ?? [];
    const kinds = new Set(ns.length ? ns.flatMap((n) => n.kinds ?? ["long", "short"]) : ["long", "short"]);
    // A niche's own channels and tracked ones: a deeper first read (more history, better scores).
    const deep = (d.reason === "group" || d.reason === "tracked") && (depthOf.get(d.id) ?? 0) < 3;
    await scanChannel(ctx, d.id, [...kinds] as ("long" | "short")[], ns, { deep });
  }
}

/** One channel: its latest videos of each kind, their scores, the channel's numbers and profile. `deep`: 150 long videos instead of 50. */
export async function scanChannel(ctx: Ctx, cid: string, kinds: ("long" | "short")[], niches: Niche[], o: { deep?: boolean } = {}) {
  const pl = playlistsOf(cid);
  const max = o.deep ? 150 : ctx.explore ? 30 : 50;
  const hints = new Map<string, "short" | "long">();
  let fallback = false;
  const longIds = kinds.includes("long") ? await ctx.yt.playlist(pl.long, max) : [];
  const shortIds = kinds.includes("short") ? await ctx.yt.playlist(pl.shorts, o.deep ? 50 : max) : [];
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
  await recomputeChannel(ctx, cid, o.deep ? 3 : 1);
  ctx.report.scanned++;
  ctx.scanned.add(cid);
  for (const n of niches) ctx.dirty.add(n.id);
}

type StoredVideo = { id: string; kind: string; published_at: string; views: number | null; title: string; tags: string[] | null; category: number | null; lang: string | null; lang_region?: string | null; kids: boolean | null; score: number | null; stats_at: string | null };

async function recomputeChannel(ctx: Ctx, cid: string, depth: number) {
  const cols = "id, kind, published_at, views, title, tags, category, lang, kids, score, stats_at";
  const first = await ctx.admin.from("yt_videos").select(`${cols}, lang_region`).eq("channel_id", cid).order("published_at", { ascending: false }).limit(400);
  // Before 0094: no lang_region.
  const data = first.error ? (await ctx.admin.from("yt_videos").select(cols).eq("channel_id", cid).order("published_at", { ascending: false }).limit(400)).data : first.data;
  const vids = (data ?? []) as StoredVideo[];
  const nums = channelNumbers(vids.map((v) => ({ id: v.id, kind: v.kind, publishedAt: v.published_at, views: v.views })));
  const now = Date.now();
  const rows = vids.map((v) => {
    const score = nums.scores.get(v.id) ?? null;
    const age = (now - Date.parse(v.published_at)) / 3_600_000;
    return { id: v.id, score, projected: projectedScore(score, v.published_at, now), vph: v.views !== null && age > 0 ? Math.round(v.views / Math.max(1, age)) : null };
  });
  for (let i = 0; i < rows.length; i += 500) await ctx.admin.rpc("outliers_set_scores", { p: rows.slice(i, i + 500) });
  const base = { long_median: nums.longMedian === null ? null : Math.round(nums.longMedian), short_median: nums.shortMedian === null ? null : Math.round(nums.shortMedian), long_n: nums.longN, short_n: nums.shortN, uploads_week: nums.uploadsWeek, last_upload_at: nums.lastUpload, scanned_at: new Date().toISOString() };
  // Its profile (1.29.0) from its latest 40 videos.
  const { data: me } = await ctx.admin.from("yt_channels").select("*").eq("id", cid).maybeSingle();
  const samples: Sample[] = vids.filter((v) => v.kind !== "live").slice(0, 40).map((v) => ({ title: v.title, tags: v.tags, category: v.category, lang: v.lang, langRegion: v.lang_region ?? null, kids: v.kids }));
  const p = channelProfile(samples, { description: (me as { description?: string | null } | null)?.description ?? null, keywords: (me as { keywords?: string | null } | null)?.keywords ?? null });
  const withProfile = { ...base, main_lang: p.mainLang, lang_share: p.langShare, kids_share: p.kidsShare, top_cat: p.topCat, region_guess: p.region, profile: p, profile_v: FIT_VERSION, profile_at: new Date().toISOString(), scan_depth: Math.max(depth, (me as { scan_depth?: number | null } | null)?.scan_depth ?? 0) };
  const saved = await ctx.admin.from("yt_channels").update(withProfile).eq("id", cid);
  // Before 0094: the numbers alone.
  if (saved.error) await ctx.admin.from("yt_channels").update(base).eq("id", cid);
  // Views over time for the young ones (at most one reading every 10 minutes).
  const at = new Date(Math.floor(now / 600_000) * 600_000).toISOString();
  const young = vids.filter((v) => now - Date.parse(v.published_at) < 7 * DAY && v.views !== null);
  if (young.length) await ctx.admin.from("yt_video_stats").upsert(young.map((v) => ({ video_id: v.id, at, views: v.views })), { onConflict: "video_id,at", ignoreDuplicates: true });
}

// ---------------------------------------------------------------------------
// 4. Which found channels belong in each niche
// ---------------------------------------------------------------------------

type Member = { channel_id: string; source: string; rel_v: number | null; verdict: string | null; hidden: boolean };
type ChannelInfo = { id: string; country: string | null; profile: ChannelProfile | null; profile_v: number | null; description: string | null; keywords: string | null; scanned_at?: string | null };

/** Every channel's latest videos (the profile's and the fit's samples), 60 channels a call. */
async function samplesOf(ctx: Ctx, ids: string[], per = 40): Promise<Map<string, Sample[]>> {
  const out = new Map<string, Sample[]>();
  for (let i = 0; i < ids.length; i += 60) {
    const { data, error } = await ctx.admin.rpc("outliers_channel_samples", { p_channels: ids.slice(i, i + 60), p_per: per });
    if (error) throw new Error(error.message);
    for (const [cid, list] of Object.entries((data ?? {}) as Record<string, unknown[][]>)) out.set(cid, (list ?? []).map(sampleOf));
  }
  return out;
}

/** Channels' details and profiles; the ones without a current profile get one from their videos. */
async function channelInfo(ctx: Ctx, ids: string[], samples?: Map<string, Sample[]>): Promise<Map<string, ChannelInfo>> {
  const out = new Map<string, ChannelInfo>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ctx.admin.from("yt_channels").select("id, country, profile, profile_v, description, keywords, scanned_at").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as ChannelInfo[]) out.set(r.id, r);
  }
  const stale = [...out.values()].filter((c) => !c.profile || (c.profile_v ?? 0) < FIT_VERSION).map((c) => c.id);
  if (stale.length) {
    const s = samples ?? (await samplesOf(ctx, stale));
    const save: Record<string, unknown>[] = [];
    for (const id of stale) {
      const list = s.get(id);
      if (!list?.length) continue;
      const c = out.get(id)!;
      const p = channelProfile(list, { description: c.description, keywords: c.keywords });
      c.profile = p;
      c.profile_v = FIT_VERSION;
      save.push({ id, main_lang: p.mainLang, lang_share: p.langShare, kids_share: p.kidsShare, top_cat: p.topCat, region_guess: p.region, profile: p, v: FIT_VERSION });
    }
    for (let i = 0; i < save.length; i += 200) await ctx.admin.rpc("outliers_set_profiles", { p: save.slice(i, i + 200) });
  }
  return out;
}

/** What a niche's fit depends on: when it changes, every found channel is checked again. */
export function fitKey(n: Niche, prefs: FitPrefs, group: string[]): string {
  return String(hash(JSON.stringify([FIT_VERSION, [...n.keywords].sort(), [...prefs.langs].sort(), [...prefs.regions].sort(), prefs.kids, !!n.only_group, [...group].sort()])));
}

/** A channel is judged once its uploads were read, or with at least this many videos stored. */
const MIN_SAMPLES = 8;

async function fitNiches(ctx: Ctx) {
  // The focused niche first (the order of ctx.niches), each in turn while there's time.
  for (const n of ctx.niches) {
    if (!ctx.left(5000)) return;
    await fitNiche(ctx, n);
  }
}

async function fitNiche(ctx: Ctx, n: Niche) {
  const { data, error } = await ctx.admin.from("outlier_niche_channels").select("channel_id, source, rel_v, verdict, hidden").eq("niche_id", n.id);
  if (error) return; // Before 0094.
  const members = ((data ?? []) as Member[]).filter((m) => !m.hidden);
  const group = members.filter((m) => GROUP_SOURCES.has(m.source)).map((m) => m.channel_id);
  const found = members.filter((m) => !GROUP_SOURCES.has(m.source));
  const prefs = prefsOf(ctx, n);
  const key = fitKey(n, prefs, group);
  const everything = n.crawl.fit_key !== key || (n.crawl.fit_v ?? 0) < FIT_VERSION || !n.profile;
  const todo = everything ? found : found.filter((m) => (m.rel_v ?? 0) < FIT_VERSION || !m.verdict || ctx.scanned.has(m.channel_id));

  // The niche's words: from its own channels and the titles its keywords found (again every 12 hours, or when it changed).
  let profile = n.profile ?? null;
  const stale = everything || !n.profile_at || Date.parse(n.profile_at) < Date.now() - 12 * 3_600_000;
  const sampleIds = [...new Set([...(stale ? found.map((m) => m.channel_id) : todo.map((m) => m.channel_id))])].slice(0, 450);
  const samples = sampleIds.length ? await samplesOf(ctx, sampleIds) : new Map<string, Sample[]>();
  if (!ctx.left(3000)) return;
  const groupInfo = await channelInfo(ctx, group);
  if (stale) {
    const stems = keywordStems(n.keywords);
    const matched: Sample[] = [];
    // Which channel each one is from: a word only one channel uses isn't the niche's (1.29.0).
    const from: string[] = [];
    for (const [cid, list] of samples)
      for (const s of list)
        if (keywordHit(s, stems) === 1) {
          matched.push(s);
          from.push(cid);
        }
    // The videos its searches found that fit, too.
    const { data: hits } = await ctx.admin.from("outlier_niche_hits").select("video_id").eq("niche_id", n.id).eq("ok", true).limit(600);
    const hitIds = ((hits ?? []) as { video_id: string }[]).map((h) => h.video_id);
    for (let i = 0; i < hitIds.length; i += 300) {
      const { data: vs } = await ctx.admin.from("yt_videos").select("channel_id, title, tags, category, lang, lang_region, kids").in("id", hitIds.slice(i, i + 300));
      for (const v of (vs ?? []) as { channel_id: string; title: string; tags: string[] | null; category: number | null; lang: string | null; lang_region: string | null; kids: boolean | null }[]) {
        const s: Sample = { title: v.title, tags: v.tags, category: v.category, lang: v.lang, langRegion: v.lang_region, kids: v.kids };
        if (keywordHit(s, stems) === 1) {
          matched.push(s);
          from.push(v.channel_id);
        }
      }
    }
    profile = nicheProfile({ keywords: n.keywords, group: [...groupInfo.values()].map((c) => c.profile).filter((p): p is ChannelProfile => !!p), matched: matched.slice(0, 3000), from: from.slice(0, 3000) });
    n.profile = profile;
    n.profile_at = new Date().toISOString();
    await ctx.admin.from("outlier_niches").update({ profile, profile_at: n.profile_at }).eq("id", n.id);
  }
  if (!profile) return;

  // Each found channel against it.
  const info = await channelInfo(ctx, todo.map((m) => m.channel_id), samples);
  const updates: { channel_id: string; relevance: number; verdict: string; v: number }[] = [];
  for (const m of todo) {
    const c = info.get(m.channel_id);
    const list = samples.get(m.channel_id) ?? [];
    // Not read yet (only the video or two a search found): it waits, and doesn't count meanwhile.
    // One video isn't a channel: judged on it, a cooking channel with one phone video counted (1.29.0).
    if (!c || !list.length || !c.profile || (!c.scanned_at && list.length < MIN_SAMPLES)) continue;
    const f = fitOf({ niche: profile, keywords: n.keywords, samples: list, profile: c.profile, prefs, country: c.country });
    updates.push({ channel_id: m.channel_id, relevance: f.relevance, verdict: f.verdict, v: FIT_VERSION });
  }
  for (let i = 0; i < updates.length; i += 300) await ctx.admin.rpc("outliers_set_relevance", { p_niche: n.id, p: updates.slice(i, i + 300) });
  ctx.report.fitted += updates.length;
  if (updates.length) ctx.dirty.add(n.id);

  // Videos its searches found that were never checked (before 1.29.0).
  const { data: open } = await ctx.admin.from("outlier_niche_hits").select("video_id").eq("niche_id", n.id).is("ok", null).limit(800);
  const openIds = ((open ?? []) as { video_id: string }[]).map((h) => h.video_id);
  if (openIds.length && ctx.left(2500)) {
    const checks: { video_id: string; ok: boolean }[] = [];
    for (let i = 0; i < openIds.length; i += 300) {
      const { data: vs } = await ctx.admin.from("yt_videos").select("id, channel_id, title, tags, category, lang, lang_region, kids, yt_channels(country)").in("id", openIds.slice(i, i + 300));
      for (const v of (vs ?? []) as { id: string; channel_id: string; title: string; tags: string[] | null; category: number | null; lang: string | null; lang_region: string | null; kids: boolean | null; yt_channels: { country: string | null } | { country: string | null }[] | null }[]) {
        const ch = Array.isArray(v.yt_channels) ? v.yt_channels[0] : v.yt_channels;
        const ok = group.includes(v.channel_id) || videoFits({ title: v.title, tags: v.tags, category: v.category, lang: v.lang, langRegion: v.lang_region, kids: v.kids }, { keywords: n.keywords, prefs, channelCountry: ch?.country ?? null });
        checks.push({ video_id: v.id, ok });
      }
    }
    for (let i = 0; i < checks.length; i += 500) await ctx.admin.rpc("outliers_set_hits", { p_niche: n.id, p: checks.slice(i, i + 500) });
    if (checks.length) ctx.dirty.add(n.id);
  }

  // Everything checked for this key: done until something changes.
  const pending = todo.length - updates.length;
  const unread = todo.filter((m) => !(samples.get(m.channel_id) ?? []).length).length;
  if (everything && pending <= unread) n.crawl = { ...n.crawl, fit_key: key, fit_v: FIT_VERSION, fit_at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// 5. Featured channels
// ---------------------------------------------------------------------------

async function expandFeatured(ctx: Ctx, n: Niche) {
  if (n.only_group) return;
  const { data: members, error } = await ctx.admin.from("outlier_niche_channels").select("channel_id, source, relevance, verdict, rel_v").eq("niche_id", n.id).eq("hidden", false);
  const list = (members ?? []) as { channel_id: string; source: string; relevance: number | null; verdict?: string | null; rel_v?: number | null }[];
  // The niche's own channels, and found ones that clearly belong (before 0094: the old relevance).
  const strong = list.filter((m) => GROUP_SOURCES.has(m.source) || (error ? (m.relevance ?? 0) >= 0.4 : (m.rel_v ?? 0) >= FIT_VERSION && m.verdict === "ok" && (m.relevance ?? 0) >= 0.7));
  const counted = list.filter((m) => GROUP_SOURCES.has(m.source) || m.verdict === "ok").length;
  if (counted >= (n.team_id ? 150 : 40) || !strong.length) return;
  const { data: chans } = await ctx.admin.from("yt_channels").select("id, featured_at, subscribers").in("id", strong.map((r) => r.channel_id));
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
// 6. Numbers and details
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
// 7. Thumbnails
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
// 8. Alerts and the Monday summary
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
// 9. The channels the team's viewers also watch
// ---------------------------------------------------------------------------

/**
 * From the team's own YouTube Analytics: the videos YouTube suggested the
 * team's videos next to (what its viewers were watching), from the daily copy
 * (the channel's top 25 for each stretch, and each video's when its page was
 * opened) and, straight from YouTube, for its 15 most watched videos lately.
 * Their channels, by how many views they sent. Once a day.
 */
async function buildAudience(ctx: Ctx) {
  const team = ctx.teamId;
  if (!team || !ctx.left(8000)) return;
  const { data: st, error } = await ctx.admin.from("outlier_settings").select("audience_at").eq("team_id", team).maybeSingle();
  if (error) return; // Before 0094.
  const at = (st as { audience_at?: string | null } | null)?.audience_at;
  if (at && Date.parse(at) > Date.now() - 20 * 3_600_000) return;
  const { data: accounts } = await ctx.admin.from("social_accounts").select("id, external_id").eq("team_id", team).eq("platform", "youtube").eq("status", "active");
  const accs = (accounts ?? []) as { id: string; external_id: string }[];
  const save = async (note: string | null) => {
    await ctx.admin.from("outlier_settings").upsert({ team_id: team, audience_at: new Date().toISOString(), audience_note: note }, { onConflict: "team_id" });
  };
  if (!accs.length) return save("no-youtube");
  const own = new Set(accs.map((a) => a.external_id));
  // Suggesting video → views it sent, and which of the team's videos it was next to.
  const sent = new Map<string, { views: number; ours: Set<string> }>();
  const add = (id: string, views: number | null, ours?: string) => {
    if (!VIDEO_ID.test(id)) return;
    const e = sent.get(id) ?? { views: 0, ours: new Set<string>() };
    if (ours) {
      e.views += views ?? 0;
      e.ours.add(ours);
    } else e.views = Math.max(e.views, views ?? 0);
    sent.set(id, e);
  };
  const { data: kept } = await ctx.admin.from("analytics_breakdowns").select("external_id, key, views").eq("team_id", team).eq("platform", "youtube").eq("dimension", "suggested_by").limit(5000);
  for (const r of (kept ?? []) as { external_id: string; key: string; views: number | null }[]) add(String(r.key).split("|")[0], num(r.views), r.external_id || undefined);
  let note: string | null = null;
  try {
    const token = await getAccessToken(accs[0].id);
    const { data: mine } = await ctx.admin.from("analytics_content").select("external_id").eq("team_id", team).eq("platform", "youtube").gte("published_at", new Date(Date.now() - 365 * DAY).toISOString()).order("views", { ascending: false }).limit(15);
    let answered = 0;
    for (const v of (mine ?? []) as { external_id: string }[]) {
      if (!ctx.left(5000)) break;
      const r = await ytFirst(token, { startDate: daysAgo(90), endDate: daysAgo(0), dimensions: "insightTrafficSourceDetail", filters: `video==${v.external_id};insightTrafficSourceType==RELATED_VIDEO`, sort: "-views", maxResults: "25" }, ["views"]);
      if (!r) continue;
      answered++;
      for (const x of r.rows) add(String(x.insightTrafficSourceDetail ?? ""), num(x.views), v.external_id);
    }
    if ((mine ?? []).length && !answered && !sent.size) note = "no-analytics";
  } catch {
    if (!sent.size) note = "no-analytics";
  }
  if (!sent.size) return save(note ?? "nothing-yet");
  // Their channels (videos not collected yet are read: 1 unit per 50).
  const ids = [...sent.keys()];
  const chanOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await ctx.admin.from("yt_videos").select("id, channel_id").in("id", ids.slice(i, i + 300));
    for (const r of (data ?? []) as { id: string; channel_id: string }[]) chanOf.set(r.id, r.channel_id);
  }
  const unknown = ids.filter((id) => !chanOf.has(id)).sort((a, b) => sent.get(b)!.views - sent.get(a)!.views).slice(0, 300);
  if (unknown.length && ctx.left(5000)) {
    try {
      for (const r of await ingestVideos(ctx, unknown)) chanOf.set(r.id, r.channel_id);
    } catch (e) {
      if (!(e instanceof QuotaError)) throw e;
    }
  }
  const byChannel = new Map<string, { views: number; videos: Set<string>; ours: Set<string>; top: [string, number][] }>();
  for (const [vid, e] of sent) {
    const cid = chanOf.get(vid);
    if (!cid || own.has(cid)) continue;
    const c = byChannel.get(cid) ?? { views: 0, videos: new Set<string>(), ours: new Set<string>(), top: [] };
    c.views += e.views;
    c.videos.add(vid);
    for (const o of e.ours) c.ours.add(o);
    c.top.push([vid, e.views]);
    byChannel.set(cid, c);
  }
  const rows = [...byChannel.entries()]
    .map(([channel_id, c]) => ({ team_id: team, channel_id, views: Math.round(c.views), videos: c.videos.size, ours: c.ours.size, top: c.top.sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]), updated_at: new Date().toISOString() }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 300);
  if (rows.length) {
    await ensureChannels(ctx, rows.slice(0, 150).map((r) => r.channel_id)).catch(() => new Set<string>());
    await upsertRows(ctx.admin, "outlier_audience", rows, "team_id,channel_id");
  }
  // Channels that dropped out of the list go.
  const keep = new Set(rows.map((r) => r.channel_id));
  const { data: old } = await ctx.admin.from("outlier_audience").select("channel_id").eq("team_id", team);
  const gone = ((old ?? []) as { channel_id: string }[]).map((r) => r.channel_id).filter((id) => !keep.has(id));
  for (let i = 0; i < gone.length; i += 200) await ctx.admin.from("outlier_audience").delete().eq("team_id", team).in("channel_id", gone.slice(i, i + 200));
  ctx.report.audience = rows.length;
  await save(note);
}

// ---------------------------------------------------------------------------
// 10. Insights, formats again, the explore niches together
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
    // An explore niche someone is waiting on: right away.
    const waiting = n.id === ctx.focus && ctx.dirty.has(n.id);
    if (!stale && !changed && !waiting) continue;
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
