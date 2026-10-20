import { bestIds, channelCount, hitRate, median, medianScore, momentum, OUTLIER, shrunkLift, type CorpusVideo } from "./corpus";
import { FORMATS } from "./formats";
import { KIND_AFTER, keywordStats, type KeywordStat } from "./keywords";
import { templateStats, type TemplateStat } from "./skeleton";
import { STYLE, STOP, tokens, isTopicWord, titleCase } from "./text";
import { closerStats, lengthStats, openerStats, traitLifts, wordLifts, type TitleModel } from "./titles";

/*
 * Everything worked out from a niche's videos (1.27.0), kept on the niche
 * (outlier_niches.insights) so the pages and the idea generator read one
 * small object instead of thousands of videos. Pure.
 *
 * Worked out three times: every video, long videos only, Shorts only.
 */

export const INSIGHTS_VERSION = 1;

export type FormatStat = {
  id: string;
  n: number;
  ch: number;
  out: number;
  med: number | null;
  hit: number;
  lift: number;
  recent: number;
  prev: number;
  mom: number;
  ex: string[];
  long: number;
  short: number;
};

export type Topic = { t: string; key: string; w: number; n: number; mom: number; lift: number; proper: boolean };
export type Numbers = { low: string; high: string; prices: string[]; durations: string[]; counts: string[]; currency: string };
export type DurationBucket = { from: number; to: number; n: number; med: number | null; lift: number };
export type ColorFamily = { id: string; name: string; share: number; outShare: number; lift: number };
export type ColorStats = { n: number; families: ColorFamily[]; lum: { all: number | null; out: number | null }; sat: { all: number | null; out: number | null } };

export type KindInsights = {
  n: number;
  channels: number;
  median: number | null;
  medianViews: number | null;
  outliers: number;
  formats: FormatStat[];
  templates: TemplateStat[];
  keywords: KeywordStat[];
  topics: Topic[];
  title: TitleModel;
  numbers: Numbers;
  durations: { buckets: DurationBucket[]; best: [number, number] | null };
  colors: ColorStats | null;
  langs: [string, number][];
};

/** `all` is only worked out when long videos or Shorts are too few on their own (it stands in for them). */
export type Insights = { v: number; at: string; all: KindInsights | null; long: KindInsights | null; short: KindInsights | null };

/** The insights for one kind ("all" when it doesn't have enough videos of that kind). */
export function forKind(ins: Insights | null | undefined, kind: "long" | "short" | "all"): KindInsights | null {
  if (!ins) return null;
  if (kind === "long") return ins.long ?? ins.all;
  if (kind === "short") return ins.short ?? ins.all;
  return ins.all ?? ins.long ?? ins.short;
}

export function formatStats(videos: CorpusVideo[], now = Date.now()): FormatStat[] {
  const base = medianScore(videos);
  const out: FormatStat[] = [];
  for (const f of FORMATS) {
    const vs = videos.filter((v) => v.formats.includes(f.id));
    if (!vs.length) continue;
    const med = medianScore(vs);
    const m = momentum(vs.map((v) => v.publishedAt), now);
    out.push({
      id: f.id,
      n: vs.length,
      ch: channelCount(vs),
      out: vs.filter((v) => (v.score ?? 0) >= OUTLIER).length,
      med,
      hit: Math.round(hitRate(vs) * 1000) / 1000,
      lift: Math.round(shrunkLift(med, base, vs.length) * 100) / 100,
      recent: m.recent,
      prev: m.prev,
      mom: m.mom,
      ex: bestIds(vs, 6),
      long: vs.filter((v) => v.kind === "long").length,
      short: vs.filter((v) => v.kind === "short").length,
    });
  }
  return out.sort((a, b) => b.lift * Math.log2(1 + b.n) - a.lift * Math.log2(1 + a.n));
}

/** Topics for new ideas: keywords made only of topic words, strongest first. */
export function topicsFrom(keywords: KeywordStat[], limit = 60): Topic[] {
  const out: Topic[] = [];
  for (const k of keywords) {
    if (k.place) continue;
    // Part of a stock phrase ("before watching this", "tier list"): the way titles are worded, not what they're about.
    if ((k.shape ?? 0) >= 0.7 || k.stock) continue;
    const parts = k.key.split(" ");
    // A name only: not "fake iphone" or "gopro review" (ideas put their own words around a topic).
    if (parts.some((p) => STOP.has(p) || STYLE.has(p) || KIND_AFTER.has(p))) continue;
    if (!parts.some((p) => isTopicWord(p))) continue;
    if (k.words > 4 || (k.words === 4 && !/\d/.test(k.key))) continue;
    const proper = k.k.split(" ").some((w) => /[A-Z]/.test(w.slice(1)) || /\d/.test(w) || (w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w)));
    out.push({ t: titleCase(k.k), key: k.key, w: Math.round(k.rank * 1000) / 1000, n: k.n, mom: k.mom, lift: k.lift, proper });
    if (out.length >= limit) break;
  }
  return out;
}

const MONEY_RE = /([$€£])\s?(\d[\d,.]*)\s*(k|m)?|(\d[\d,.]*)\s*(k|m)?\s*(ron|lei|eur|euros?|usd|dollars?)/i;
function moneyValue(raw: string): { value: number; cur: string } | null {
  const m = MONEY_RE.exec(raw);
  if (!m) return null;
  const n = Number((m[2] ?? m[4] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = /k/i.test(m[3] ?? m[5] ?? "") ? 1000 : /m/i.test(m[3] ?? m[5] ?? "") ? 1_000_000 : 1;
  const sym = m[1];
  const word = (m[6] ?? "").toLowerCase();
  const cur = sym === "€" || word.startsWith("eur") ? "EUR" : sym === "£" ? "GBP" : word === "ron" || word === "lei" ? "RON" : "USD";
  return { value: n * mult, cur };
}
export function moneyText(value: number, cur: string): string {
  const v = value >= 100 ? Math.round(value / 10) * 10 : Math.round(value);
  const s = v.toLocaleString("en-US");
  if (cur === "EUR") return `€${s}`;
  if (cur === "GBP") return `£${s}`;
  if (cur === "RON") return `${s} RON`;
  return `$${s}`;
}

/** Prices, time spans and counts the niche's titles use, for filling in new titles. */
export function numbersFrom(videos: CorpusVideo[]): Numbers {
  const prices: { value: number; cur: string; raw: string }[] = [];
  const durations = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const v of videos) {
    for (const t of tokens(v.title)) {
      if (t.kind === "money") {
        const mv = moneyValue(t.raw);
        if (mv && mv.value > 0 && mv.value < 1e8) prices.push({ ...mv, raw: t.raw.replace(/\s+/g, "") });
      } else if (t.kind === "time") {
        const m = /^(\d[\d,]*)\s?(h|hr|hrs|hours?|days?|weeks?|months?|years?|minutes?|mins?|nights?)$/i.exec(t.raw.trim());
        if (m) {
          const unit = m[2].toLowerCase().replace(/^(h|hr|hrs)$/, "hours").replace(/^mins?$/, "minutes");
          const n = Number(m[1].replace(/,/g, ""));
          const word = n === 1 ? unit.replace(/s$/, "") : unit.endsWith("s") ? unit : `${unit}s`;
          const key = titleCase(`${n} ${word}`);
          durations.set(key, (durations.get(key) ?? 0) + 1);
        }
      } else if (t.kind === "num") {
        const n = Number(t.raw.replace(/[#,]/g, ""));
        if (Number.isInteger(n) && n >= 3 && n <= 1000 && !/[kmx%]$/i.test(t.raw)) counts.set(String(n), (counts.get(String(n)) ?? 0) + 1);
      }
    }
  }
  const curCount = new Map<string, number>();
  for (const p of prices) curCount.set(p.cur, (curCount.get(p.cur) ?? 0) + 1);
  const currency = [...curCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const inCur = prices.filter((p) => p.cur === currency).map((p) => p.value).sort((a, b) => a - b);
  const q = (p: number) => inCur[Math.min(inCur.length - 1, Math.max(0, Math.floor(p * (inCur.length - 1))))];
  const low = inCur.length >= 4 ? q(0.2) : currency === "RON" ? 100 : 20;
  const high = inCur.length >= 4 ? Math.max(q(0.85), low * 5) : currency === "RON" ? 10000 : 2000;
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const priceRaw = new Map<string, number>();
  for (const p of prices) if (p.cur === currency) priceRaw.set(moneyText(p.value, p.cur), (priceRaw.get(moneyText(p.value, p.cur)) ?? 0) + 1);
  return { low: moneyText(low, currency), high: moneyText(high, currency), prices: top(priceRaw, 8), durations: top(durations, 8), counts: top(counts, 8), currency };
}

const LONG_EDGES = [0, 240, 480, 720, 1200, 1800, 3600, 1e9];
const SHORT_EDGES = [0, 16, 31, 46, 61, 91, 181];

/** How each video length did (seconds), and the band that did best. */
export function durationStats(videos: CorpusVideo[], kind: "long" | "short" | "all"): { buckets: DurationBucket[]; best: [number, number] | null } {
  const vs = videos.filter((v) => v.durationS !== null && v.score !== null && (kind === "all" ? v.kind === "long" : v.kind === kind));
  const edges = kind === "short" ? SHORT_EDGES : LONG_EDGES;
  const base = medianScore(vs);
  const buckets = edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1] - 1;
    const b = vs.filter((v) => (v.durationS as number) >= from && (v.durationS as number) <= to);
    const med = medianScore(b);
    return { from, to, n: b.length, med, lift: Math.round(shrunkLift(med, base, b.length, 15) * 100) / 100 };
  });
  const ok = buckets.filter((b) => b.n >= 8);
  const top = ok.length ? [...ok].sort((a, b) => b.lift - a.lift)[0] : null;
  return { buckets, best: top ? [top.from, Math.min(top.to, kind === "short" ? 180 : 10_800)] : null };
}

// Colour families by hue (and grey / dark / light), for thumbnails.
const FAMILIES: { id: string; name: string }[] = [
  { id: "red", name: "Red" },
  { id: "orange", name: "Orange" },
  { id: "yellow", name: "Yellow" },
  { id: "green", name: "Green" },
  { id: "teal", name: "Teal" },
  { id: "blue", name: "Blue" },
  { id: "purple", name: "Purple" },
  { id: "pink", name: "Pink" },
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
  { id: "grey", name: "Grey" },
];
export function familyOf(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "grey";
  const [r, g, b] = [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.16) return "dark";
  if (l > 0.88 && s < 0.5) return "light";
  if (s < 0.18) return "grey";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 68) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

export function colorStats(videos: CorpusVideo[]): ColorStats | null {
  const vs = videos.filter((v) => v.colors && v.colors.length && v.score !== null);
  if (vs.length < 12) return null;
  const outs = vs.filter((v) => (v.score ?? 0) >= OUTLIER);
  const share = (list: CorpusVideo[], fam: string) => (list.length ? list.filter((v) => (v.colors ?? []).slice(0, 2).some((c) => familyOf(c) === fam)).length / list.length : 0);
  const families = FAMILIES.map((f) => {
    const s = share(vs, f.id);
    const o = share(outs, f.id);
    return { id: f.id, name: f.name, share: Math.round(s * 1000) / 1000, outShare: Math.round(o * 1000) / 1000, lift: s > 0 && outs.length >= 5 ? Math.round((o / s) * 100) / 100 : 1 };
  }).filter((f) => f.share > 0);
  const med = (list: CorpusVideo[], k: "lum" | "sat") => median(list.map((v) => v[k]).filter((x): x is number => typeof x === "number"));
  return { n: vs.length, families, lum: { all: med(vs, "lum"), out: outs.length >= 5 ? med(outs, "lum") : null }, sat: { all: med(vs, "sat"), out: outs.length >= 5 ? med(outs, "sat") : null } };
}

function kindInsights(videos: CorpusVideo[], kind: "long" | "short" | "all", now: number): KindInsights {
  const formats = formatStats(videos, now);
  const keywords = keywordStats(videos, { now, limit: 160 });
  const words = wordLifts(videos);
  const title: TitleModel = {
    traits: traitLifts(videos),
    length: lengthStats(videos),
    openers: openerStats(videos),
    closers: closerStats(videos),
    words: [...words.slice(0, 40), ...words.slice(-12).filter((w) => w.lift < 0.95)],
    formats: formats.map((f) => ({ id: f.id, lift: f.lift, n: f.n })),
  };
  const langs = new Map<string, number>();
  for (const v of videos) if (v.lang) langs.set(v.lang, (langs.get(v.lang) ?? 0) + 1);
  return {
    n: videos.length,
    channels: channelCount(videos),
    median: medianScore(videos),
    medianViews: median(videos.map((v) => v.views).filter((x): x is number => x !== null)),
    outliers: videos.filter((v) => (v.score ?? 0) >= OUTLIER).length,
    formats,
    templates: templateStats(videos, { limit: 40 }),
    keywords,
    topics: topicsFrom(keywords),
    title,
    numbers: numbersFrom(videos),
    durations: durationStats(videos, kind),
    colors: colorStats(videos),
    langs: [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

/** Everything, for every kind with at least 40 videos (long and Shorts apart). */
export function buildInsights(videos: CorpusVideo[], now = Date.now()): Insights {
  const long = videos.filter((v) => v.kind === "long");
  const short = videos.filter((v) => v.kind === "short");
  const enough = (n: number) => n >= 40;
  return {
    v: INSIGHTS_VERSION,
    at: new Date(now).toISOString(),
    // Both kinds on their own: no need for them together (half the work on a big niche).
    all: enough(long.length) && enough(short.length) ? null : kindInsights(videos, "all", now),
    long: enough(long.length) ? kindInsights(long, "long", now) : null,
    short: enough(short.length) ? kindInsights(short, "short", now) : null,
  };
}

/**
 * Formats across several niches, for "every niche": counts add up and
 * lifts average by how many videos each niche has (log space).
 */
export function mergeFormats(lists: FormatStat[][]): FormatStat[] {
  const by = new Map<string, FormatStat[]>();
  for (const list of lists) for (const f of list) by.set(f.id, [...(by.get(f.id) ?? []), f]);
  const out: FormatStat[] = [];
  for (const [id, fs] of by) {
    const n = fs.reduce((s, f) => s + f.n, 0);
    const wlog = fs.reduce((s, f) => s + Math.log(Math.max(0.01, f.lift)) * f.n, 0) / Math.max(1, n);
    const meds = fs.filter((f) => f.med !== null);
    out.push({
      id,
      n,
      ch: fs.reduce((s, f) => s + f.ch, 0),
      out: fs.reduce((s, f) => s + f.out, 0),
      med: meds.length ? Math.round((meds.reduce((s, f) => s + (f.med as number) * f.n, 0) / meds.reduce((s, f) => s + f.n, 0)) * 100) / 100 : null,
      hit: Math.round((fs.reduce((s, f) => s + f.hit * f.n, 0) / Math.max(1, n)) * 1000) / 1000,
      lift: Math.round(Math.exp(wlog) * 100) / 100,
      recent: fs.reduce((s, f) => s + f.recent, 0),
      prev: fs.reduce((s, f) => s + f.prev, 0),
      mom: Math.round((((fs.reduce((s, f) => s + f.recent, 0) + 1) / 30) / ((fs.reduce((s, f) => s + f.prev, 0) + 1) / 90)) * 100) / 100,
      ex: fs.flatMap((f) => f.ex.slice(0, 2)).slice(0, 6),
      long: fs.reduce((s, f) => s + f.long, 0),
      short: fs.reduce((s, f) => s + f.short, 0),
    });
  }
  return out.sort((a, b) => b.lift * Math.log2(1 + b.n) - a.lift * Math.log2(1 + a.n));
}

/** Every video id an insights object points at (to load their thumbnails and titles in one go). */
export function exampleIds(k: KindInsights | null, limit = 400): string[] {
  if (!k) return [];
  const ids = new Set<string>();
  const add = (xs: string[]) => {
    for (const x of xs) if (ids.size < limit) ids.add(x);
  };
  for (const f of k.formats) add(f.ex.slice(0, 4));
  for (const t of k.templates) add(t.ex.slice(0, 3));
  for (const kw of k.keywords.slice(0, 60)) add(kw.ex.slice(0, 2));
  for (const o of k.title.openers) add(o.ex.slice(0, 2));
  return [...ids];
}

/**
 * The part of a niche's insights the panels use (a video's remixes and its
 * title's breakdown): small enough to load when the first panel opens.
 */
export type NicheModel = Pick<KindInsights, "n" | "median" | "topics" | "numbers" | "title" | "formats">;

export function toModel(k: KindInsights | null): NicheModel | null {
  if (!k) return null;
  return { n: k.n, median: k.median, topics: k.topics.slice(0, 40), numbers: k.numbers, title: k.title, formats: k.formats };
}

const EMPTY_TITLE: TitleModel = { traits: [], length: { median: 0, outlierMedian: null, best: null, buckets: [] }, openers: [], closers: [], words: [], formats: [] };
const EMPTY_NUMBERS: Numbers = { low: "$20", high: "$2,000", prices: [], durations: [], counts: [], currency: "USD" };

/** A model (or part of one) as insights, the rest empty, for the functions that take insights. */
export function modelInsights(m: Partial<NicheModel> | null): KindInsights | null {
  if (!m) return null;
  return {
    n: m.n ?? 0,
    median: m.median ?? null,
    topics: m.topics ?? [],
    numbers: m.numbers ?? EMPTY_NUMBERS,
    title: m.title ?? EMPTY_TITLE,
    formats: m.formats ?? [],
    channels: 0,
    medianViews: null,
    outliers: 0,
    templates: [],
    keywords: [],
    durations: { buckets: [], best: null },
    colors: null,
    langs: [],
  };
}
