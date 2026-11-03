// Outliers (1.27.0) for the mock: the database functions (outliers_*) and
// tables the page reads, answered from sample data made by make-outliers.ts
// (written to .outliers.json on first use; dates are moved to the real "now").
//   MOCK_OUTLIERS_EMPTY=1   the team has no niche yet (the page shows Explore and the setup)
//   MOCK_OUTLIERS_NEW=1     its niche was just added (collecting the first videos)
//   MOCK_OUTLIERS_ACCESS=0  no way to read YouTube (the banner)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILE = path.join(__dirname, ".outliers.json");
const ROOT = path.join(__dirname, "..", "..");
let D = null;

const NICHE = "0e000000-0000-4000-8000-000000000001";
const NICHE2 = "0e000000-0000-4000-8000-000000000002";
const EXPLORE = [
  ["tech", "Tech and gadgets", "blue"], ["gaming", "Gaming", "violet"], ["finance", "Personal finance", "green"], ["business", "Business", "teal"], ["food", "Food and cooking", "orange"],
  ["fitness", "Fitness", "red"], ["travel", "Travel", "sky"], ["science", "Science and learning", "indigo"], ["cars", "Cars", "slate"], ["diy", "DIY and building", "brown"],
  ["beauty", "Beauty and fashion", "pink"], ["challenges", "Challenges and entertainment", "gold"], ["true-crime", "True crime and mystery", "plum"], ["movies", "Movies and TV", "rose"],
  ["self-improvement", "Self-improvement", "mint"], ["real-estate", "Homes and real estate", "olive"], ["sports", "Sports", "navy"], ["animals", "Animals and nature", "lime"],
  ["music", "Music", "fuchsia"], ["commentary", "Commentary and news", "coral"], ["art", "Art and design", "purple"], ["film-making", "Photo and film-making", "cyan"],
  ["outdoors", "Outdoors and survival", "aqua"], ["ai", "AI and software", "yellow"],
].map(([slug, name, color], i) => ({ id: `0f000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, slug, name, color }));
const FOLDERS = [
  { id: "0d000000-0000-4000-8000-000000000001", name: "Thumbnail ideas", color: "amber" },
  { id: "0d000000-0000-4000-8000-000000000002", name: "Next month", color: "violet" },
  { id: "0d000000-0000-4000-8000-000000000003", name: "Fake vs real series", color: "teal" },
];

function load() {
  if (D) return D;
  if (!fs.existsSync(FILE)) execFileSync("npx", ["tsx", path.join(__dirname, "make-outliers.ts")], { stdio: "inherit", cwd: ROOT });
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  // The sample was made at raw.now: move every date so "3 days ago" stays 3 days ago.
  const delta = Date.now() - raw.now;
  const move = (iso) => (iso ? new Date(Date.parse(iso) + delta).toISOString() : iso);
  const fixV = (v) => ({ ...v, published_at: move(v.published_at), stats_at: move(v.stats_at), fetched_at: move(v.fetched_at) });
  const fixC = (c) => ({ ...c, published_at: move(c.published_at), last_upload_at: move(c.last_upload_at) });
  const tech = { channels: raw.tech.channels.map(fixC), videos: raw.tech.videos.map(fixV) };
  const explore = raw.explore.map((e) => ({ slug: e.slug, channels: e.channels.map(fixC), videos: e.videos.map(fixV) }));
  const channels = new Map([...tech.channels, ...explore.flatMap((e) => e.channels)].map((c) => [c.id, c]));
  const all = [...tech.videos, ...explore.flatMap((e) => e.videos)];
  const byId = new Map(all.map((v) => [v.id, v]));
  const byChannel = new Map();
  for (const v of all) byChannel.set(v.channel_id, [...(byChannel.get(v.channel_id) ?? []), v]);
  for (const list of byChannel.values()) list.sort((a, b) => a.published_at.localeCompare(b.published_at) || a.id.localeCompare(b.id));
  // The second niche: the smart-home and wearables corner of the same channels.
  const smartCh = new Set(tech.channels.slice(22).map((c) => c.id));
  const tracked = tech.channels
    .filter((c) => c.subscribers > 80_000)
    .slice(0, 6)
    .map((c) => c.id);
  const best = [...tech.videos].filter((v) => v.kind === "long").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const saves = [
    ...best.slice(0, 7).map((v, i) => ({ kind: "video", video_id: v.id, folder: i < 3 ? FOLDERS[0].id : i < 5 ? FOLDERS[2].id : null })),
    ...tech.channels.slice(3, 5).map((c) => ({ kind: "channel", channel_id: c.id, folder: FOLDERS[1].id })),
  ].map((s, i) => ({ id: `0c000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, ...s }));
  const ideaSaves = [
    { titles: ["I Tested a $50 Fake Steam Deck 2", "Fake vs Real Steam Deck 2: Can You Tell?", "This $50 Steam Deck 2 Fooled Me"], hook: "This is a Steam Deck 2, and this is another one. One of them cost $50. Can you tell which?", topic: "Steam Deck 2", formatId: "fake-vs-real", type: "Hero", folder: FOLDERS[1].id },
    { titles: ["$20 vs $2,000 Smart Ring", "Cheap vs Expensive Smart Ring"], hook: "One of these cost $20. The other cost $2,000. By the end of this video you'll know if the difference is worth it.", topic: "Smart Ring", formatId: "cheap-vs-expensive", type: "Hero", folder: null },
  ].map((x, i) => ({ id: `0c100000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, kind: "idea", folder: x.folder, idea: { key: `${x.formatId}|${x.topic.toLowerCase()}`, titles: x.titles, hook: x.hook, topic: x.topic, formatId: x.formatId, type: x.type, sources: [{ id: best[i].id, title: best[i].title }], niche: "Tech reviews", kind: "long", why: ["Fake vs real videos typically do 2.4× their channel's usual in Tech reviews (112 videos)"] } }));
  D = { raw, tech, explore, channels, all, byId, byChannel, smartCh, tracked, saves: [...saves, ...ideaSaves], insights: raw.tech.insights, exploreInsights: raw.exploreInsights };
  return D;
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function nicheVideos(d, nicheId, team) {
  if (nicheId === NICHE) return d.tech.videos;
  if (nicheId === NICHE2) return d.tech.videos.filter((v) => d.smartCh.has(v.channel_id));
  const e = EXPLORE.find((x) => x.id === nicheId);
  if (e) return d.explore.find((x) => x.slug === e.slug)?.videos ?? [];
  if (process.env.MOCK_OUTLIERS_EMPTY) return d.explore.flatMap((x) => x.videos);
  return team ? d.all : d.all;
}

function counts(videos) {
  return { videos: videos.length, channels: new Set(videos.map((v) => v.channel_id)).size, outliers: videos.filter((v) => (v.score ?? 0) >= 3).length };
}

function videoRow(d, v, extra = {}) {
  const c = d.channels.get(v.channel_id) ?? {};
  const peers = (d.byChannel.get(v.channel_id) ?? []).filter((x) => x.kind === v.kind);
  const i = peers.findIndex((x) => x.id === v.id);
  const around = peers.slice(Math.max(0, i - 8), i + 4);
  return {
    id: v.id,
    channel_id: v.channel_id,
    title: v.title,
    published_at: v.published_at,
    duration_s: v.duration_s,
    kind: v.kind,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    score: v.score,
    projected: v.projected,
    vph: v.vph,
    formats: v.formats,
    lang: v.lang,
    thumb_colors: v.thumb_colors,
    thumb_hash: v.thumb_hash,
    stats_at: v.stats_at,
    ch_title: c.title,
    ch_handle: c.handle,
    ch_avatar: c.avatar_url,
    ch_subs: c.subscribers,
    ch_usual: v.kind === "short" ? c.short_median : c.long_median,
    ch_published_at: c.published_at,
    peers: around.map((x) => x.views),
    peer_i: around.findIndex((x) => x.id === v.id) + 1,
    ...extra,
  };
}

const words = (s) => String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

function filterVideos(d, b) {
  const f = b.p_f || {};
  let list;
  if (Array.isArray(f.ids)) list = f.ids.map((id) => d.byId.get(id)).filter(Boolean);
  else if (f.channel) list = d.byChannel.get(f.channel) ?? [];
  else if (f.scope === "tracked") list = d.tracked.flatMap((id) => d.byChannel.get(id) ?? []);
  else list = nicheVideos(d, b.p_niche, true);
  const now = Date.now();
  const ch = (v) => d.channels.get(v.channel_id) ?? {};
  list = list.filter((v) => {
    if (f.kind === "long" || f.kind === "short" ? v.kind !== f.kind : v.kind === "live") return false;
    if (f.min_score !== undefined && !((v.score ?? -1) >= f.min_score)) return false;
    if (f.max_score !== undefined && !((v.score ?? 1e9) <= f.max_score)) return false;
    if (f.min_views !== undefined && !(v.views >= f.min_views)) return false;
    if (f.max_views !== undefined && !(v.views <= f.max_views)) return false;
    if (f.min_subs !== undefined && !((ch(v).subscribers ?? -1) >= f.min_subs)) return false;
    if (f.max_subs !== undefined && !((ch(v).subscribers ?? 1e12) <= f.max_subs)) return false;
    if (f.days !== undefined && Date.parse(v.published_at) < now - f.days * 86400e3) return false;
    if (f.min_dur !== undefined && !(v.duration_s >= f.min_dur)) return false;
    if (f.max_dur !== undefined && !(v.duration_s <= f.max_dur)) return false;
    if (f.min_vph !== undefined && !((v.vph ?? 0) >= f.min_vph)) return false;
    if (f.min_eng !== undefined && !(((v.likes + v.comments) * 100) / Math.max(1, v.views) >= f.min_eng)) return false;
    if (f.min_vps !== undefined && !(v.views / Math.max(1, ch(v).subscribers ?? 0) >= f.min_vps)) return false;
    if (Array.isArray(f.langs) && f.langs.length && !f.langs.includes(v.lang)) return false;
    if (Array.isArray(f.formats) && f.formats.length && !v.formats.some((x) => f.formats.includes(x))) return false;
    if (f.bits && (v.bits & f.bits) !== f.bits) return false;
    if (f.q) {
      const ws = words(f.q);
      const tw = [...words(v.title), ...(v.tags ?? []).flatMap(words)];
      const inTitle = ws.every((w) => tw.some((x) => x.startsWith(w)));
      if (!inTitle && !String(ch(v).title ?? "").toLowerCase().includes(String(f.q).toLowerCase())) return false;
    }
    if (Array.isArray(f.exclude_channels) && f.exclude_channels.includes(v.channel_id)) return false;
    if (Array.isArray(f.exclude_words) && f.exclude_words.some((w) => w && v.title.toLowerCase().includes(String(w).toLowerCase()))) return false;
    if (f.channel_days !== undefined && Date.parse(ch(v).published_at) < now - f.channel_days * 86400e3) return false;
    return true;
  });
  const eng = (v) => (v.likes + v.comments) / Math.max(1, v.views);
  const by = {
    projected: (a, b) => (b.projected ?? b.score ?? -1) - (a.projected ?? a.score ?? -1) || b.views - a.views,
    views: (a, b) => b.views - a.views,
    vph: (a, b) => (b.vph ?? 0) - (a.vph ?? 0) || b.views - a.views,
    newest: (a, b) => b.published_at.localeCompare(a.published_at),
    oldest: (a, b) => a.published_at.localeCompare(b.published_at),
    eng: (a, b) => eng(b) - eng(a),
    vps: (a, b) => b.views / Math.max(1, ch(b).subscribers ?? 0) - a.views / Math.max(1, ch(a).subscribers ?? 0),
    small: (a, b) => (ch(a).subscribers ?? 1e12) - (ch(b).subscribers ?? 1e12) || (b.score ?? -1) - (a.score ?? -1),
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.views - a.views,
  };
  return [...list].sort(by[b.p_sort] ?? by.score);
}

function channelStats(d, c, videos) {
  const vs = videos ?? d.byChannel.get(c.id) ?? [];
  const scored = vs.filter((v) => v.score !== null);
  const top = [...scored].sort((a, b) => b.score - a.score)[0];
  return { stored: vs.length, outliers: scored.filter((v) => v.score >= 3).length, best: top ? top.score : null, best_video: top ? top.id : null };
}

function statsOf(v) {
  // Readings since it was found: the views growing towards today's count.
  const start = Date.parse(v.published_at);
  const span = Math.max(3600e3, Date.parse(v.stats_at) - start);
  const n = Math.min(14, Math.max(2, Math.round(span / 86400e3)));
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n;
    const share = 1 - Math.pow(1 - t, 2.2);
    return { at: new Date(start + span * t).toISOString(), views: Math.round(v.views * share), likes: Math.round(v.likes * share), comments: Math.round(v.comments * share) };
  });
}

function nicheInfo(d, id) {
  const vs = nicheVideos(d, id, true);
  const fresh = id === NICHE && process.env.MOCK_OUTLIERS_NEW;
  return {
    id,
    name: id === NICHE ? "Tech reviews" : "Smart home",
    color: id === NICHE ? "blue" : "teal",
    keywords: id === NICHE ? ["fake iphone", "phone review", "gadgets", "tech tested"] : ["smart home", "robot vacuum", "smart ring"],
    exclude_words: [],
    lang: null,
    region: null,
    kinds: ["long", "short"],
    position: id === NICHE ? 0 : 1,
    crawled_at: new Date(Date.now() - 14 * 60e3).toISOString(),
    insights_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    created_at: fresh ? new Date(Date.now() - 2 * 60e3).toISOString() : "2026-10-01T09:00:00Z",
    counts: fresh ? { videos: 12, channels: 4, outliers: 1 } : counts(vs),
    note: null,
    phase: fresh ? "new" : "steady",
  };
}

function outliersFixtures({ TEAM, U, people }) {
  const d = () => load();
  const savesRows = () =>
    d().saves.map((s, i) => ({
      id: s.id,
      team_id: TEAM,
      kind: s.kind,
      folder_id: s.folder,
      video_id: s.video_id ?? null,
      channel_id: s.channel_id ?? null,
      idea: s.idea ?? null,
      note: i === 0 ? "Copy this thumbnail layout: the price in yellow, the phone on the right." : i === 7 ? "Watch how often they post." : null,
      saved_at: new Date(Date.now() - (i + 1) * 9 * 3600e3).toISOString(),
      saved_by: U[i % 3],
      project_id: null,
      short_id: null,
    }));
  const empty = !!process.env.MOCK_OUTLIERS_EMPTY;
  return {
    rpc: {
      outliers_overview: () => {
        const D = d();
        const rows = savesRows();
        return {
          niches: empty ? [] : [nicheInfo(D, NICHE), nicheInfo(D, NICHE2)],
          explore: EXPLORE.map((e) => {
            const set = D.explore.find((x) => x.slug === e.slug);
            return { id: e.id, slug: e.slug, name: e.name, color: e.color, counts: set ? counts(set.videos) : null, crawled_at: set ? new Date(Date.now() - 3 * 3600e3).toISOString() : null };
          }),
          tracked: empty ? [] : D.tracked,
          folders: FOLDERS.map((f, i) => ({ ...f, position: i, created_by: U[0], count: rows.filter((r) => r.folder_id === f.id).length })),
          saved: rows.length,
          unsorted: rows.filter((r) => !r.folder_id).length,
          saves: rows.filter((r) => r.kind !== "idea").map((r) => [r.video_id ?? r.channel_id, r.folder_id, r.id]),
          settings: { alert_min: 5, alert_to: "managers", watch_words: ["fake iphone"], digest: true, digest_sent_on: null },
        };
      },
      outliers_videos: (b) => {
        const D = d();
        const list = filterVideos(D, b);
        const off = Math.max(0, b.p_offset ?? 0);
        return list.slice(off, off + Math.min(200, Math.max(1, b.p_limit ?? 48))).map((v) => videoRow(D, v, { total: list.length }));
      },
      outliers_channels: (b) => {
        const D = d();
        const f = b.p_f || {};
        let ids;
        if (f.tracked || f.scope === "tracked") ids = D.tracked;
        else if (f.hidden) ids = [];
        else ids = [...new Set(nicheVideos(D, b.p_niche, true).map((v) => v.channel_id))];
        let rows = ids
          .map((id) => D.channels.get(id))
          .filter(Boolean)
          .filter((c) => (!f.q || c.title.toLowerCase().includes(String(f.q).toLowerCase())) && (f.min_subs === undefined || c.subscribers >= f.min_subs) && (f.max_subs === undefined || c.subscribers <= f.max_subs))
          .map((c) => ({ ...c, ...channelStats(D, c), tracked: D.tracked.includes(c.id), source: "search", relevance: 0.82, hidden: false }));
        const rate = (c) => (c.stored ? c.outliers / c.stored : 0);
        const by = {
          best: (a, b) => (b.best ?? 0) - (a.best ?? 0),
          subs: (a, b) => b.subscribers - a.subscribers,
          small: (a, b) => a.subscribers - b.subscribers,
          uploads: (a, b) => (b.uploads_week ?? 0) - (a.uploads_week ?? 0),
          recent: (a, b) => String(b.last_upload_at).localeCompare(String(a.last_upload_at)),
          newest: (a, b) => String(b.published_at).localeCompare(String(a.published_at)),
          rate: (a, b) => rate(b) - rate(a) || (b.best ?? 0) - (a.best ?? 0),
        };
        rows.sort(by[b.p_sort] ?? by.rate);
        const total = rows.length;
        const off = Math.max(0, b.p_offset ?? 0);
        rows = rows.slice(off, off + (b.p_limit ?? 60));
        return rows.map((r) => ({ ...r, total }));
      },
      outliers_video: (b) => {
        const D = d();
        const v = D.byId.get(b.p_video);
        if (!v) return null;
        const c = D.channels.get(v.channel_id);
        const peers = (D.byChannel.get(v.channel_id) ?? []).filter((x) => x.kind === v.kind);
        const t = Date.parse(v.published_at);
        const near = [...peers].sort((a, b) => Math.abs(Date.parse(a.published_at) - t) - Math.abs(Date.parse(b.published_at) - t)).slice(0, 41).sort((a, b) => a.published_at.localeCompare(b.published_at));
        const rows = savesRows();
        const top = (v.score ?? 0) >= 8;
        return {
          video: { ...v, thumb_at: v.fetched_at },
          channel: c,
          peers: near.map((x) => ({ id: x.id, title: x.title, views: x.views, score: x.score, published_at: x.published_at })),
          stats: statsOf(v),
          changes: top ? [{ at: new Date(t + 30 * 3600e3).toISOString(), field: "title", before: v.title.replace(/^I /, "We ").replace(/\?$/, ""), after: v.title, views: Math.round(v.views * 0.2) }] : [],
          saves: rows.filter((r) => r.video_id === v.id).map((r) => ({ id: r.id, folder_id: r.folder_id })),
          tracked: D.tracked.includes(v.channel_id),
          niches: [NICHE],
        };
      },
      // 1.43.0 (0122): the channels the team's viewers also watch, each with its videos: up to 6 long ones and 6
      // Shorts, the ones that sent viewers first, then the biggest outliers.
      outliers_audience: () => {
        const D = d();
        if (empty) return { at: null, note: null, rows: [] };
        const chans = [...D.channels.values()].slice(0, 9);
        return {
          at: new Date(Date.now() - 5 * 3600e3).toISOString(),
          note: null,
          rows: chans.map((c, i) => {
            const vs = D.byChannel.get(c.id) ?? [];
            const top = vs.filter((v) => v.kind === "long").slice(-2).map((v) => v.id);
            const pick = (kind) =>
              vs
                .filter((v) => v.kind === kind)
                .map((v) => ({ v, sent: top.includes(v.id) }))
                .sort((a, b) => Number(b.sent) - Number(a.sent) || (b.v.score ?? 0) - (a.v.score ?? 0))
                .slice(0, 6);
            const examples = [...pick("long"), ...pick("short")].map(({ v, sent }) => ({ id: v.id, kind: v.kind, title: String(v.title).slice(0, 80), views: v.views, score: v.score, at: v.published_at, sent }));
            return {
              id: c.id,
              views: 420 - i * 37,
              videos: 3 + (i % 4),
              ours: 2 + (i % 3),
              top,
              title: c.title,
              handle: c.handle,
              avatar: c.avatar_url,
              subs: c.subscribers,
              country: c.country ?? null,
              lang: c.main_lang ?? null,
              long_median: c.long_median,
              short_median: c.short_median,
              tracked: D.tracked.includes(c.id),
              niches: i < 3 ? [NICHE] : [],
              examples,
            };
          }),
        };
      },
      outliers_channel: (b) => {
        const D = d();
        const c = D.channels.get(b.p_channel);
        if (!c) return null;
        const vs = [...(D.byChannel.get(c.id) ?? [])].reverse();
        const rows = savesRows();
        return {
          channel: c,
          videos: [...vs.filter((v) => v.kind === "long").slice(0, 60), ...vs.filter((v) => v.kind === "short").slice(0, 60)]
            .sort((a, b) => b.published_at.localeCompare(a.published_at))
            .map((v) => ({ id: v.id, title: v.title, views: v.views, likes: v.likes, comments: v.comments, score: v.score, projected: v.projected, published_at: v.published_at, duration_s: v.duration_s, kind: v.kind, formats: v.formats, vph: v.vph })),
          tracked: D.tracked.includes(c.id),
          saves: rows.filter((r) => r.channel_id === c.id).map((r) => ({ id: r.id, folder_id: r.folder_id })),
          niches: D.tech.channels.some((x) => x.id === c.id) ? [{ id: NICHE, name: "Tech reviews", team: true, source: "search", relevance: 0.82, hidden: false }] : [],
        };
      },
    },
    tables: {
      get outlier_niches() {
        const D = d();
        return [
          { id: NICHE, team_id: empty ? "00000000-0000-4000-8000-000000000000" : TEAM, name: "Tech reviews", insights: D.insights },
          { id: NICHE2, team_id: empty ? "00000000-0000-4000-8000-000000000000" : TEAM, name: "Smart home", insights: D.insights },
          ...EXPLORE.map((e) => ({ id: e.id, team_id: null, name: e.name, insights: null })),
        ];
      },
      get outlier_global() {
        return [{ key: "explore", insights: d().exploreInsights, at: new Date().toISOString() }];
      },
      outlier_dismissed: [],
      get outlier_saves() {
        return savesRows();
      },
      get yt_videos() {
        const D = d();
        return D.all.map((v) => {
          const c = D.channels.get(v.channel_id) ?? {};
          return { ...v, yt_channels: { title: c.title, handle: c.handle, avatar_url: c.avatar_url, subscribers: c.subscribers, long_median: c.long_median, short_median: c.short_median, published_at: c.published_at } };
        });
      },
      get yt_channels() {
        return [...d().channels.values()];
      },
    },
    helpers: { load, NICHE, NICHE2, EXPLORE },
  };
}

module.exports = { outliersFixtures, load, NICHE, NICHE2, EXPLORE };
