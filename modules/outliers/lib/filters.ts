import { FORMAT_BY_ID, TRAIT_BY_ID } from "./formats";

/*
 * Search filters (1.27.0): what's in the address ↔ what the page shows ↔
 * what the database is asked. Pure.
 */

export type Sort = "score" | "projected" | "views" | "vph" | "newest" | "eng" | "vps" | "small" | "oldest";
export const SORTS: { id: Sort; label: string }[] = [
  { id: "score", label: "Outlier score" },
  { id: "projected", label: "Heading for (young videos)" },
  { id: "views", label: "Views" },
  { id: "vph", label: "Views per hour" },
  { id: "newest", label: "Newest" },
  { id: "eng", label: "Engagement" },
  { id: "vps", label: "Views per subscriber" },
  { id: "small", label: "Smallest channels" },
  { id: "oldest", label: "Oldest" },
];
const SORT_IDS = new Set<string>(SORTS.map((s) => s.id));

export type Filters = {
  q?: string;
  kind?: "long" | "short";
  minScore?: number;
  maxScore?: number;
  minViews?: number;
  maxViews?: number;
  minSubs?: number;
  maxSubs?: number;
  days?: number;
  minDur?: number;
  maxDur?: number;
  minVph?: number;
  minEng?: number;
  minVps?: number;
  langs?: string[];
  formats?: string[];
  traits?: string[];
  excludeWords?: string[];
  excludeChannels?: string[];
  channelDays?: number;
  sort?: Sort;
  /** 1.29.0: "audience", the channels the team's viewers also watch. */
  scope?: "niche" | "tracked" | "all" | "audience";
};

export const SCORE_STEPS = [1, 1.5, 2, 3, 5, 10, 25, 50, 100];
export const VIEW_STEPS = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
export const SUB_STEPS = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 10_000_000];
export const DAY_OPTIONS: { days: number | null; label: string; short: string }[] = [
  { days: 1, label: "Last 24 hours", short: "24h" },
  { days: 7, label: "Last 7 days", short: "7d" },
  { days: 30, label: "Last 30 days", short: "30d" },
  { days: 90, label: "Last 3 months", short: "3m" },
  { days: 180, label: "Last 6 months", short: "6m" },
  { days: 365, label: "Last year", short: "1y" },
  { days: null, label: "Any time", short: "All" },
];
export const DURATIONS: { id: string; label: string; min?: number; max?: number; kind?: "long" | "short" }[] = [
  { id: "u1", label: "Under 1 min", max: 60 },
  { id: "1-4", label: "1–4 min", min: 60, max: 240 },
  { id: "4-10", label: "4–10 min", min: 240, max: 600 },
  { id: "10-20", label: "10–20 min", min: 600, max: 1200 },
  { id: "20-40", label: "20–40 min", min: 1200, max: 2400 },
  { id: "40", label: "40 min+", min: 2400 },
];
export const CHANNEL_AGES: { days: number; label: string }[] = [
  { days: 180, label: "Started in the last 6 months" },
  { days: 365, label: "Started in the last year" },
  { days: 730, label: "Started in the last 2 years" },
];

const num = (v: string | null | undefined, min = 0, max = 1e12): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const list = (v: string | null | undefined, ok: (x: string) => boolean, max = 20) =>
  v
    ? [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))].filter(ok).slice(0, max)
    : undefined;

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const getter = (p: Params) => (k: string): string | null => {
  if (p instanceof URLSearchParams) return p.get(k);
  const v = p[k];
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
};

/** Filters from the address (anything odd is ignored). */
export function readFilters(p: Params): Filters {
  const g = getter(p);
  const f: Filters = {};
  const q = g("q")?.trim();
  if (q) f.q = q.slice(0, 120);
  const k = g("k");
  if (k === "long" || k === "short") f.kind = k;
  f.minScore = num(g("min"), 0, 10_000);
  f.maxScore = num(g("max"), 0, 10_000);
  f.minViews = num(g("views"));
  f.maxViews = num(g("vmax"));
  f.minSubs = num(g("subs"));
  f.maxSubs = num(g("smax"));
  f.days = num(g("days"), 1, 36500);
  f.minDur = num(g("dmin"), 0, 86400);
  f.maxDur = num(g("dmax"), 0, 86400);
  f.minVph = num(g("vph"));
  f.minEng = num(g("eng"), 0, 100);
  f.minVps = num(g("vps"), 0, 10_000);
  f.langs = list(g("lang"), (x) => /^[a-z]{2}$/.test(x), 12);
  f.formats = list(g("fmt"), (x) => FORMAT_BY_ID.has(x), 12);
  f.traits = list(g("tr"), (x) => TRAIT_BY_ID.has(x), 12);
  f.excludeWords = list(g("xw"), (x) => x.length <= 40, 20)?.map((x) => x.toLowerCase());
  f.excludeChannels = list(g("xc"), (x) => /^UC[A-Za-z0-9_-]{22}$/.test(x), 50);
  f.channelDays = num(g("age"), 1, 36500);
  const s = g("sort");
  if (s && SORT_IDS.has(s)) f.sort = s as Sort;
  const scope = g("scope");
  if (scope === "tracked" || scope === "all" || scope === "audience") f.scope = scope;
  for (const key of Object.keys(f) as (keyof Filters)[]) if (f[key] === undefined || (Array.isArray(f[key]) && !(f[key] as unknown[]).length)) delete f[key];
  return f;
}

/** Filters → the address's query (only what's set). */
export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of ["q", "k", "min", "max", "views", "vmax", "subs", "smax", "days", "dmin", "dmax", "vph", "eng", "vps", "lang", "fmt", "tr", "xw", "xc", "age", "sort", "scope"]) p.delete(k);
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== "") p.set(k, String(v));
  };
  set("q", f.q);
  set("k", f.kind);
  set("min", f.minScore);
  set("max", f.maxScore);
  set("views", f.minViews);
  set("vmax", f.maxViews);
  set("subs", f.minSubs);
  set("smax", f.maxSubs);
  set("days", f.days);
  set("dmin", f.minDur);
  set("dmax", f.maxDur);
  set("vph", f.minVph);
  set("eng", f.minEng);
  set("vps", f.minVps);
  if (f.langs?.length) set("lang", f.langs.join(","));
  if (f.formats?.length) set("fmt", f.formats.join(","));
  if (f.traits?.length) set("tr", f.traits.join(","));
  if (f.excludeWords?.length) set("xw", f.excludeWords.join(","));
  if (f.excludeChannels?.length) set("xc", f.excludeChannels.join(","));
  set("age", f.channelDays);
  if (f.sort && f.sort !== "score") set("sort", f.sort);
  if (f.scope && f.scope !== "niche") set("scope", f.scope);
  return p;
}

/** Filters → what outliers_videos() reads (p_f). */
export function filtersToRpc(f: Filters): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (f.scope === "tracked" || f.scope === "audience") r.scope = f.scope;
  if (f.kind) r.kind = f.kind;
  if (f.minScore !== undefined) r.min_score = f.minScore;
  if (f.maxScore !== undefined) r.max_score = f.maxScore;
  if (f.minViews !== undefined) r.min_views = Math.round(f.minViews);
  if (f.maxViews !== undefined) r.max_views = Math.round(f.maxViews);
  if (f.minSubs !== undefined) r.min_subs = Math.round(f.minSubs);
  if (f.maxSubs !== undefined) r.max_subs = Math.round(f.maxSubs);
  if (f.days !== undefined) r.days = Math.round(f.days);
  if (f.minDur !== undefined) r.min_dur = Math.round(f.minDur);
  if (f.maxDur !== undefined) r.max_dur = Math.round(f.maxDur);
  if (f.minVph !== undefined) r.min_vph = f.minVph;
  if (f.minEng !== undefined) r.min_eng = f.minEng;
  if (f.minVps !== undefined) r.min_vps = f.minVps;
  if (f.langs?.length) r.langs = f.langs;
  if (f.formats?.length) r.formats = f.formats;
  if (f.traits?.length) r.bits = f.traits.reduce((b, id) => b | (TRAIT_BY_ID.get(id)?.bit ?? 0), 0);
  if (f.q) r.q = f.q;
  if (f.excludeWords?.length) r.exclude_words = f.excludeWords;
  if (f.excludeChannels?.length) r.exclude_channels = f.excludeChannels;
  if (f.channelDays !== undefined) r.channel_days = Math.round(f.channelDays);
  return r;
}

/** How many filters are on (for the Filters button's badge); the words and the sort don't count. */
export function activeCount(f: Filters): number {
  let n = 0;
  if (f.kind) n++;
  if (f.minScore !== undefined || f.maxScore !== undefined) n++;
  if (f.minViews !== undefined || f.maxViews !== undefined) n++;
  if (f.minSubs !== undefined || f.maxSubs !== undefined) n++;
  if (f.days !== undefined) n++;
  if (f.minDur !== undefined || f.maxDur !== undefined) n++;
  if (f.minVph !== undefined) n++;
  if (f.minEng !== undefined) n++;
  if (f.minVps !== undefined) n++;
  if (f.langs?.length) n++;
  if (f.formats?.length) n++;
  if (f.traits?.length) n++;
  if (f.excludeWords?.length) n++;
  if (f.excludeChannels?.length) n++;
  if (f.channelDays !== undefined) n++;
  if (f.scope && f.scope !== "niche") n++;
  return n;
}

/** "12.3K", "1.2M", "940". */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

/** "12:04", "1:02:05", "0:45". */
export function duration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return "";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "3 hours ago", "5 days ago", "2 years ago" (rough, like YouTube's). */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  const units: [number, string][] = [
    [31_536_000, "year"],
    [2_592_000, "month"],
    [604_800, "week"],
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [u, name] of units) {
    const n = Math.floor(s / u);
    if (n >= 1) return `${n} ${name}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
