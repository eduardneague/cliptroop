import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/avatar";
import { forKind, mergeFormats, exampleIds, type Insights, type KindInsights } from "./insights";
import type { TemplateStat } from "./skeleton";
import type { ChannelDetail, ChannelRowData, Folder, IdeasData, MiniVideo, NicheInfo, OutlierSettings, OutlierVideo, Overview, SavedIdea, SavedItem, VideoDetail, VideoPage } from "./types";

/*
 * Reading Outliers for the pages (1.27.0), as the person: the database
 * functions check they're on the team (outliers_*), Row Level Security does
 * the rest.
 */

type Supa = SupabaseClient;
type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toVideo(r: Row): OutlierVideo {
  return {
    id: String(r.id),
    channelId: String(r.channel_id),
    title: String(r.title ?? ""),
    publishedAt: String(r.published_at),
    durationS: num(r.duration_s),
    kind: (r.kind as OutlierVideo["kind"]) ?? "long",
    views: num(r.views),
    likes: num(r.likes),
    comments: num(r.comments),
    score: num(r.score),
    projected: num(r.projected),
    vph: num(r.vph),
    formats: (r.formats as string[] | null) ?? [],
    lang: str(r.lang),
    colors: (r.thumb_colors as string[] | null) ?? null,
    thumbHash: str(r.thumb_hash),
    statsAt: str(r.stats_at),
    channel: { title: String(r.ch_title ?? ""), handle: str(r.ch_handle), avatar: str(r.ch_avatar), subs: num(r.ch_subs), usual: num(r.ch_usual), publishedAt: str(r.ch_published_at) },
    peers: Array.isArray(r.peers) ? (r.peers as unknown[]).map((x) => Number(x) || 0) : null,
    peerI: typeof r.peer_i === "number" ? r.peer_i - 1 : null,
  };
}

function toNiche(r: Row, explore: boolean): NicheInfo {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: String(r.color ?? "blue"),
    keywords: (r.keywords as string[] | null) ?? [],
    excludeWords: (r.exclude_words as string[] | null) ?? [],
    lang: str(r.lang),
    region: str(r.region),
    kinds: ((r.kinds as string[] | null) ?? ["long", "short"]).filter((k): k is "long" | "short" => k === "long" || k === "short"),
    position: num(r.position) ?? 0,
    crawledAt: str(r.crawled_at),
    insightsAt: str(r.insights_at),
    createdAt: str(r.created_at),
    counts: (r.counts as NicheInfo["counts"]) ?? null,
    note: str(r.note),
    phase: str(r.phase),
    explore,
    slug: str(r.slug),
  };
}

const DEFAULT_SETTINGS: OutlierSettings = { alertMin: 5, alertTo: "managers", watchWords: [], digest: true };

/** The niches, explore niches, tracked channels, folders and settings (one call). */
export const getOverview = cache(async function getOverview(teamId: string): Promise<Overview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outliers_overview", { p_team: teamId });
  const o = (!error && data ? data : {}) as Row;
  const s = (o.settings ?? null) as Row | null;
  return {
    niches: ((o.niches as Row[] | undefined) ?? []).map((r) => toNiche(r, false)),
    explore: ((o.explore as Row[] | undefined) ?? []).map((r) => toNiche(r, true)),
    tracked: (o.tracked as string[] | undefined) ?? [],
    folders: ((o.folders as Row[] | undefined) ?? []).map((f) => ({ id: String(f.id), name: String(f.name), color: String(f.color ?? "amber"), position: num(f.position) ?? 0, createdBy: str(f.created_by), count: num(f.count) ?? 0 })) as Folder[],
    saved: num(o.saved) ?? 0,
    unsorted: num(o.unsorted) ?? 0,
    saves: ((o.saves as unknown[][] | undefined) ?? []).filter((x) => Array.isArray(x) && x[0] && x[2]).map((x) => ({ ref: String(x[0]), folderId: str(x[1]), id: String(x[2]) })),
    settings: s ? { alertMin: num(s.alert_min) ?? 5, alertTo: (s.alert_to as OutlierSettings["alertTo"]) ?? "managers", watchWords: (s.watch_words as string[] | null) ?? [], digest: s.digest !== false } : DEFAULT_SETTINGS,
  };
});

/** Videos with filters (p_f as outliers_videos reads it). */
export async function readVideos(supabase: Supa, teamId: string, nicheId: string | null, f: Record<string, unknown>, sort: string, limit: number, offset = 0): Promise<VideoPage> {
  const { data, error } = await supabase.rpc("outliers_videos", { p_team: teamId, p_niche: nicheId, p_f: f, p_sort: sort, p_limit: limit, p_offset: offset });
  if (error || !Array.isArray(data)) return { rows: [], total: 0 };
  const rows = (data as Row[]).map(toVideo);
  return { rows, total: num((data as Row[])[0]?.total) ?? 0 };
}

/** A few words about many videos at once (examples next to formats, keywords and ideas). */
export async function miniVideos(supabase: Supa, ids: string[]): Promise<Record<string, MiniVideo>> {
  const out: Record<string, MiniVideo> = {};
  const uniq = [...new Set(ids)].filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x));
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await supabase.from("yt_videos").select("id, title, score, views, kind, published_at, duration_s, channel_id, thumb_colors, yt_channels(title, avatar_url)").in("id", uniq.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) {
      const ch = (Array.isArray(r.yt_channels) ? r.yt_channels[0] : r.yt_channels) as Row | null;
      out[String(r.id)] = { id: String(r.id), title: String(r.title ?? ""), channel: String(ch?.title ?? ""), channelId: String(r.channel_id), avatar: str(ch?.avatar_url), score: num(r.score), views: num(r.views), kind: (r.kind as MiniVideo["kind"]) ?? "long", publishedAt: String(r.published_at), durationS: num(r.duration_s), tint: Array.isArray(r.thumb_colors) ? str(r.thumb_colors[0]) : null };
    }
  }
  return out;
}

/** A niche's saved insights (null before the collector worked them out). */
export async function nicheInsights(supabase: Supa, nicheId: string | null): Promise<Insights | null> {
  if (!nicheId) return null;
  const { data } = await supabase.from("outlier_niches").select("insights").eq("id", nicheId).maybeSingle();
  return ((data?.insights as Insights | null) ?? null) || null;
}

/**
 * "Every niche": the explore niches together plus the team's other niches,
 * for one kind. Formats add up; templates keep the best of each.
 */
export async function crossInsights(supabase: Supa, teamId: string, kind: "long" | "short" | "all", exceptNiche: string | null): Promise<KindInsights | null> {
  const [{ data: g }, { data: own }] = await Promise.all([
    supabase.from("outlier_global").select("insights").eq("key", "explore").maybeSingle(),
    supabase.from("outlier_niches").select("id, insights").eq("team_id", teamId),
  ]);
  // The team's own niches first (their topics and numbers lead), then every explore niche together.
  const parts: KindInsights[] = [];
  for (const r of (own ?? []) as Row[]) {
    if (r.id === exceptNiche) continue;
    const k = forKind((r.insights as Insights | null) ?? null, kind);
    if (k) parts.push(k);
  }
  const global = forKind((g?.insights as Insights | null) ?? null, kind);
  if (global) parts.push(global);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const templates = new Map<string, TemplateStat>();
  for (const p of parts) for (const t of p.templates) if (!templates.has(t.key) || templates.get(t.key)!.lift < t.lift) templates.set(t.key, t);
  const base = parts[0];
  return {
    ...base,
    n: parts.reduce((s, p) => s + p.n, 0),
    channels: parts.reduce((s, p) => s + p.channels, 0),
    outliers: parts.reduce((s, p) => s + p.outliers, 0),
    formats: mergeFormats(parts.map((p) => p.formats)),
    templates: [...templates.values()].sort((a, b) => b.lift * Math.log2(1 + b.n) - a.lift * Math.log2(1 + a.n)).slice(0, 60),
  };
}

/** Titles the team already made or planned (ideas too close to these aren't suggested). */
export async function teamTitles(supabase: Supa, teamId: string): Promise<string[]> {
  const [{ data: longs }, { data: shorts }, { data: own }] = await Promise.all([
    supabase.from("long_video_projects").select("title, project_titles(title)").eq("team_id", teamId).order("created_at", { ascending: false }).limit(400),
    supabase.from("short_videos").select("title").eq("team_id", teamId).order("created_at", { ascending: false }).limit(400),
    supabase.from("analytics_content").select("title").eq("team_id", teamId).eq("platform", "youtube").order("published_at", { ascending: false }).limit(400),
  ]);
  const out = new Set<string>();
  for (const r of (longs ?? []) as Row[]) {
    if (typeof r.title === "string") out.add(r.title);
    for (const t of ((r.project_titles as Row[] | null) ?? [])) if (typeof t.title === "string") out.add(t.title);
  }
  for (const r of [...((shorts ?? []) as Row[]), ...((own ?? []) as Row[])]) if (typeof r.title === "string") out.add(r.title);
  return [...out].slice(0, 1200);
}

/** Everything the idea generator needs (it runs in the browser). */
export async function ideasData(teamId: string, userId: string, nicheId: string | null, kind: "long" | "short"): Promise<IdeasData> {
  const supabase = await createClient();
  const [ins, cross, mine, { data: dismissed }, { data: saved }] = await Promise.all([
    nicheInsights(supabase, nicheId),
    crossInsights(supabase, teamId, kind, nicheId),
    teamTitles(supabase, teamId),
    supabase.from("outlier_dismissed").select("key").eq("user_id", userId).eq("team_id", teamId).limit(2000),
    supabase.from("outlier_saves").select("id, idea").eq("team_id", teamId).eq("kind", "idea").order("saved_at", { ascending: false }).limit(2000),
  ]);
  // Every niche at once: everything together is "this niche".
  const local = nicheId ? forKind(ins, kind) : cross;
  const ids = [...exampleIds(local, 300), ...exampleIds(cross, 200)];
  const examples = await miniVideos(supabase, ids);
  return {
    local,
    cross,
    examples,
    mine,
    dismissed: ((dismissed ?? []) as Row[]).map((r) => String(r.key)),
    saved: ((saved ?? []) as Row[]).map((r) => ({ key: String((r.idea as Row | null)?.key ?? ""), id: String(r.id) })).filter((x) => x.key),
  };
}

function toChannelRow(r: Row): ChannelRowData {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    handle: str(r.handle),
    avatar: str(r.avatar_url),
    country: str(r.country),
    publishedAt: str(r.published_at),
    subs: num(r.subscribers),
    views: num(r.views),
    videoCount: num(r.video_count),
    longMedian: num(r.long_median),
    shortMedian: num(r.short_median),
    uploadsWeek: num(r.uploads_week),
    lastUploadAt: str(r.last_upload_at),
    stored: num(r.stored) ?? 0,
    outliers: num(r.outliers) ?? 0,
    best: num(r.best),
    bestVideo: str(r.best_video),
    tracked: r.tracked === true,
    source: str(r.source),
    relevance: num(r.relevance),
    hidden: r.hidden === true,
  };
}

export async function readChannels(supabase: Supa, teamId: string, nicheId: string | null, f: Record<string, unknown>, sort: string, limit = 60, offset = 0): Promise<{ rows: ChannelRowData[]; total: number }> {
  const { data, error } = await supabase.rpc("outliers_channels", { p_team: teamId, p_niche: nicheId, p_f: f, p_sort: sort, p_limit: limit, p_offset: offset });
  if (error || !Array.isArray(data)) return { rows: [], total: 0 };
  return { rows: (data as Row[]).map(toChannelRow), total: num((data as Row[])[0]?.total) ?? 0 };
}

/** The team's own revenue per 1,000 views over the last 90 days, by kind (null when unknown or not allowed). */
async function teamRpm(supabase: Supa, teamId: string, kind: string): Promise<{ rpm: number; currency: string } | null> {
  const { data: allowed } = await supabase.rpc("can_view_revenue", { p_team: teamId });
  if (allowed !== true) return null;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const content = kind === "short" ? "shorts" : "long";
  const [{ data: rev }, { data: daily }] = await Promise.all([
    supabase.from("analytics_revenue_daily").select("revenue, currency").eq("team_id", teamId).eq("platform", "youtube").eq("content", content).gte("day", since),
    supabase.from("analytics_daily").select("views").eq("team_id", teamId).eq("platform", "youtube").eq("content", content).gte("day", since),
  ]);
  const money = ((rev ?? []) as Row[]).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const views = ((daily ?? []) as Row[]).reduce((s, r) => s + (Number(r.views) || 0), 0);
  if (money <= 0 || views < 10_000) return null;
  return { rpm: Math.round((money / views) * 1000 * 100) / 100, currency: String(((rev ?? []) as Row[])[0]?.currency ?? "USD") };
}

export async function getVideoDetail(teamId: string, id: string): Promise<VideoDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outliers_video", { p_team: teamId, p_video: id });
  if (error || !data) return null;
  const d = data as Row;
  const v = d.video as Row;
  const c = (d.channel ?? {}) as Row;
  const base = toVideo({ ...v, ch_title: c.title, ch_handle: c.handle, ch_avatar: c.avatar_url, ch_subs: c.subscribers, ch_usual: v.kind === "short" ? c.short_median : c.long_median, ch_published_at: c.published_at });
  const rpm = await teamRpm(supabase, teamId, String(v.kind));
  return {
    video: {
      ...base,
      description: str(v.description),
      tags: (v.tags as string[] | null) ?? null,
      category: num(v.category),
      hd: (v.hd as boolean | null) ?? null,
      captions: (v.captions as boolean | null) ?? null,
      licensed: (v.licensed as boolean | null) ?? null,
      kids: (v.kids as boolean | null) ?? null,
      chapters: num(v.chapters),
      bits: num(v.bits) ?? 0,
      thumbHash: str(v.thumb_hash),
      lum: num(v.thumb_lum),
      sat: num(v.thumb_sat),
      fetchedAt: str(v.fetched_at),
    },
    channel: { ...toChannelRow(c), description: str(c.description), keywords: str(c.keywords), longN: num(c.long_n) ?? 0, shortN: num(c.short_n) ?? 0 },
    peers: ((d.peers as Row[] | undefined) ?? []).map((p) => ({ id: String(p.id), title: String(p.title ?? ""), views: num(p.views), score: num(p.score), publishedAt: String(p.published_at) })),
    stats: ((d.stats as Row[] | undefined) ?? []).map((s) => ({ at: String(s.at), views: num(s.views), likes: num(s.likes), comments: num(s.comments) })),
    changes: ((d.changes as Row[] | undefined) ?? []).map((ch) => ({ at: String(ch.at), field: String(ch.field), before: str(ch.before), after: str(ch.after), views: num(ch.views) })),
    saves: ((d.saves as Row[] | undefined) ?? []).map((s) => ({ id: String(s.id), folderId: str(s.folder_id) })),
    tracked: d.tracked === true,
    niches: (d.niches as string[] | undefined) ?? [],
    earnings: rpm && base.views !== null ? { ...rpm, estimate: Math.round((base.views / 1000) * rpm.rpm) } : null,
  };
}

export async function getChannelDetail(teamId: string, id: string): Promise<ChannelDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outliers_channel", { p_team: teamId, p_channel: id });
  if (error || !data) return null;
  const d = data as Row;
  const c = (d.channel ?? {}) as Row;
  const niches = ((d.niches as Row[] | undefined) ?? []).map((n) => ({ id: String(n.id), name: String(n.name), team: n.team === true, source: String(n.source ?? ""), relevance: num(n.relevance), hidden: n.hidden === true }));
  const videos = ((d.videos as Row[] | undefined) ?? []).map((v) => ({ id: String(v.id), title: String(v.title ?? ""), views: num(v.views), likes: num(v.likes), comments: num(v.comments), score: num(v.score), projected: num(v.projected), publishedAt: String(v.published_at), durationS: num(v.duration_s), kind: (v.kind as "long" | "short" | "live") ?? "long", formats: (v.formats as string[] | null) ?? [], vph: num(v.vph) }));
  // Channels like it: the same niche, a similar size, the most outliers first.
  let similar: ChannelRowData[] = [];
  const home = niches.find((n) => !n.hidden) ?? null;
  if (home) {
    const subs = num(c.subscribers);
    const f = subs ? { min_subs: Math.round(subs / 4), max_subs: Math.round(subs * 4) } : {};
    const { rows } = await readChannels(supabase, teamId, home.id, f, "rate", 9, 0);
    similar = rows.filter((r) => r.id !== id).slice(0, 8);
  }
  return {
    channel: { ...toChannelRow({ ...c, stored: videos.length, outliers: videos.filter((v) => (v.score ?? 0) >= 3).length, best: Math.max(0, ...videos.map((v) => v.score ?? 0)) || null }), description: str(c.description), keywords: str(c.keywords), longN: num(c.long_n) ?? 0, shortN: num(c.short_n) ?? 0 },
    videos,
    tracked: d.tracked === true,
    saves: ((d.saves as Row[] | undefined) ?? []).map((s) => ({ id: String(s.id), folderId: str(s.folder_id) })),
    niches,
    similar,
  };
}

/** Saved videos, ideas and channels (a folder, the unsorted ones, or all). */
export async function getSaved(teamId: string, folder: string | null): Promise<SavedItem[]> {
  const supabase = await createClient();
  let q = supabase.from("outlier_saves").select("id, kind, folder_id, video_id, channel_id, idea, note, saved_at, saved_by, project_id, short_id").eq("team_id", teamId).order("saved_at", { ascending: false }).limit(500);
  if (folder === "unsorted") q = q.is("folder_id", null);
  else if (folder && /^[0-9a-f-]{36}$/i.test(folder)) q = q.eq("folder_id", folder);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  const videoIds = rows.map((r) => str(r.video_id)).filter((x): x is string => !!x);
  const channelIds = rows.map((r) => str(r.channel_id)).filter((x): x is string => !!x);
  const people = [...new Set(rows.map((r) => str(r.saved_by)).filter((x): x is string => !!x))];
  const [vids, chans, profs] = await Promise.all([
    videoIds.length ? supabase.from("yt_videos").select("id, channel_id, title, published_at, duration_s, kind, views, likes, comments, score, projected, vph, formats, lang, thumb_colors, thumb_hash, stats_at, yt_channels(title, handle, avatar_url, subscribers, long_median, short_median, published_at)").in("id", videoIds) : Promise.resolve({ data: [] }),
    channelIds.length ? supabase.from("yt_channels").select("id, title, handle, avatar_url, country, published_at, subscribers, views, video_count, long_median, short_median, uploads_week, last_upload_at").in("id", channelIds) : Promise.resolve({ data: [] }),
    people.length ? supabase.from("profiles").select("id, username, full_name, email, avatar_url").in("id", people) : Promise.resolve({ data: [] }),
  ]);
  const vmap = new Map(((vids.data ?? []) as Row[]).map((v) => {
    const ch = (Array.isArray(v.yt_channels) ? v.yt_channels[0] : v.yt_channels) as Row | null;
    return [String(v.id), toVideo({ ...v, ch_title: ch?.title, ch_handle: ch?.handle, ch_avatar: ch?.avatar_url, ch_subs: ch?.subscribers, ch_usual: v.kind === "short" ? ch?.short_median : ch?.long_median, ch_published_at: ch?.published_at })];
  }));
  const cmap = new Map(((chans.data ?? []) as Row[]).map((c) => [String(c.id), toChannelRow(c)]));
  const pmap = new Map(((profs.data ?? []) as Row[]).map((p) => [String(p.id), { name: displayName(p.username as string | null, p.full_name as string | null, p.email as string | null), avatar: str(p.avatar_url) }]));
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as SavedItem["kind"],
    folderId: str(r.folder_id),
    note: str(r.note),
    savedAt: String(r.saved_at),
    savedBy: str(r.saved_by) ? pmap.get(String(r.saved_by)) ?? null : null,
    projectId: str(r.project_id),
    shortId: str(r.short_id),
    video: r.video_id ? vmap.get(String(r.video_id)) ?? null : null,
    channel: r.channel_id ? cmap.get(String(r.channel_id)) ?? null : null,
    idea: (r.idea as SavedIdea | null) ?? null,
  }));
}

/** Can Outliers read YouTube for this team (its connected channel, or the app's API key)? */
export async function accessStatus(supabase: Supa, teamId: string): Promise<{ youtube: boolean; key: boolean }> {
  const { data } = await supabase.from("social_accounts").select("id").eq("team_id", teamId).eq("platform", "youtube").eq("status", "active").limit(1);
  return { youtube: !!(data ?? []).length, key: !!process.env.YOUTUBE_API_KEY?.trim() };
}

/** The team's own YouTube video titles, for suggesting a first niche's keywords. */
export async function ownTitles(supabase: Supa, teamId: string, n = 120): Promise<string[]> {
  const { data } = await supabase.from("analytics_content").select("title, views").eq("team_id", teamId).eq("platform", "youtube").order("views", { ascending: false }).limit(n);
  return ((data ?? []) as Row[]).map((r) => String(r.title ?? "")).filter(Boolean);
}
