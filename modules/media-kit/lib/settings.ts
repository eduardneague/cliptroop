/**
 * The media kit's setup (1.37.0): what a team chooses before making its kit, saved per team (media_kit_settings,
 * migration 0114) so the next one starts from there. The owner: "show rates or say on request … set your rates …
 * one kit per channel / per team with all the channels … separate kits for platforms or everything all together …
 * be able to set a lot of things before generating it".
 *
 * Pure: the builder, the server action that saves it and the tests share it. `readKitSettings` turns anything (an
 * old save, a hand-edited row, a form) into a valid setup: every field checked and kept to its size, anything wrong
 * replaced by its default.
 */

export const KIT_PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
export type KitPlatform = (typeof KIT_PLATFORMS)[number];
export const KIT_PLATFORM_NAME: Record<KitPlatform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

export const KIT_PERIODS = [
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "365 days", days: 365 },
  { id: "custom", label: "Custom", days: 0 },
] as const;
export type KitPeriod = (typeof KIT_PERIODS)[number]["id"];

/** The pages, in the kit's order. */
export const KIT_SECTIONS = ["cover", "about", "glance", "platforms", "audience", "videos", "partners", "rates", "contact"] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];
export const KIT_SECTION_LABEL: Record<KitSection, string> = {
  cover: "Cover",
  about: "About us",
  glance: "At a glance",
  platforms: "A page per platform",
  audience: "Audience",
  videos: "Best videos",
  partners: "Brands and kind words",
  rates: "Rates",
  contact: "Contact",
};

export type KitTheme = "light" | "dark";
/** The cover's picture: your best videos' thumbnails, a photo you add, or neither (big numbers instead). */
export type KitCover = "videos" | "photo" | "plain";

export type RatePackage = { id: string; name: string; detail: string; platform: KitPlatform | "any"; price: number | null };
export type Testimonial = { id: string; quote: string; by: string };

// ---- 1.39.0: your own numbers, picked videos, the cover's grid ----------------------------------------------------------
// The owner: "add the option to manually input data for everything too, auto is very nice, but sometimes you might want
// to do something else, so add a manual button for each part of the presentation where there are graphs, data, etc.
// auto should be on by default"; "pick which videos i want to feature manually as well"; "for the cover, i want to be
// able to select what videos i want in the first page, long videos too, and a hybrid between longs and shorts".

/** The age groups the platforms share (YouTube's and Meta's), youngest first. */
export const KIT_AGES = ["13–17", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"] as const;
export type KitAge = (typeof KIT_AGES)[number];

/** A video picked by hand: what the kit shows of it, as it was when picked (fresher numbers are used when the kit has them). */
export type PickedVideo = {
  platform: KitPlatform;
  id: string;
  kind: "short" | "long" | "live" | "post";
  title: string;
  /** Its thumbnail through ClipTroop's own address (nothing else is kept). */
  thumb: string | null;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};
export const videoKey = (v: { platform: string; id: string }) => `${v.platform}:${v.id}`;

/** A platform's page with numbers you type in (Manual). An empty field is left off the page. */
export type ManualPlatform = {
  on: boolean;
  handle: string;
  followers: number | null;
  /** Follower growth over the period, in %. */
  growth: number | null;
  views: number | null;
  /** Views against the period before, in %. */
  viewsChange: number | null;
  /** Likes, comments and shares for every view, in %. */
  engagementRate: number | null;
  avgViews: number | null;
  /** YouTube: long videos and Shorts on their own. */
  avgViewsLong: number | null;
  avgViewsShort: number | null;
  posted: number | null;
  watchHours: number | null;
  /** The chart: the real views per day, none, or your own points. */
  chart: "auto" | "none" | "own";
  chartLabel: string;
  chartPoints: number[];
};
/** Who watches on a platform, typed in (Manual): shares in %. */
export type ManualAudience = {
  on: boolean;
  women: number | null;
  men: number | null;
  other: number | null;
  ages: Record<KitAge, number | null>;
  countries: { name: string; share: number | null }[];
};
/** At a glance (and the cover's and contact page's totals), typed in (Manual). An empty field is left off the page. */
export type ManualTotals = {
  on: boolean;
  followers: number | null;
  growth: number | null;
  views: number | null;
  viewsChange: number | null;
  engagementRate: number | null;
  avgViews: number | null;
  posted: number | null;
};
export type KitManual = {
  glance: ManualTotals;
  platforms: Partial<Record<KitPlatform, ManualPlatform>>;
  audience: Partial<Record<KitPlatform, ManualAudience>>;
};
/** The cover's wall: Shorts (tall), long videos (wide), both together, or whatever the videos are. */
export type KitCoverGrid = "auto" | "shorts" | "longs" | "mixed";
export type VideoPicks = { on: boolean; list: PickedVideo[] };

export type MediaKitSettings = {
  v: 1;
  /** The channels in the kit (none chosen: every connected one). */
  platforms: KitPlatform[];
  /** One kit with everything, or one kit per platform. */
  split: "together" | "each";
  period: KitPeriod;
  /** Custom: the first and last day (YYYY-MM-DD). */
  from: string | null;
  to: string | null;
  sections: Record<KitSection, boolean>;
  /** How many best videos (3 or 6). */
  videos: 3 | 6;
  theme: KitTheme;
  /** "#RRGGBB", or "" for the team's own colour. */
  accent: string;
  cover: KitCover;
  /** The cover photo in the media-kit bucket ("<team id>/<file>"). */
  coverPath: string | null;
  /** The kit's name ("" for the team's name). */
  title: string;
  tagline: string;
  about: string;
  /** Who watches, in your words (the Audience page). */
  audienceNote: string;
  rates: { show: boolean; currency: string; note: string; packages: RatePackage[] };
  partners: string[];
  testimonials: Testimonial[];
  contact: { name: string; email: string; phone: string; website: string; cta: string };
  /** 1.39.0: platforms with no connection, added by hand (their numbers in manual.platforms). */
  extra: KitPlatform[];
  manual: KitManual;
  /** The best videos page: the most viewed (off), or these, in this order. */
  videoPicks: VideoPicks;
  /** The cover's wall: the best (off), or these. */
  coverPicks: VideoPicks;
  coverGrid: KitCoverGrid;
  /** 1.40.0: the template this setup was opened from (media_kit_templates, migration 0118), or null. */
  fromTemplate: string | null;
};

export const LIMITS = {
  title: 80,
  tagline: 160,
  about: 600,
  audienceNote: 400,
  rateNote: 300,
  packages: 8,
  packageName: 60,
  packageDetail: 160,
  price: 10_000_000,
  partners: 16,
  partner: 40,
  testimonials: 3,
  quote: 280,
  by: 80,
  name: 80,
  email: 120,
  phone: 40,
  website: 120,
  cta: 120,
  // 1.39.0
  handle: 60,
  chartLabel: 40,
  chartPoints: 60,
  /** The best videos page shows up to 6; the cover's wall up to 15. */
  videoPicks: 6,
  coverPicks: 15,
  pickTitle: 200,
  countries: 5,
  country: 40,
  /** Any count (followers, views…). */
  count: 1e12,
} as const;

/** Currencies offered first (any ISO code the browser knows works too). */
export const KIT_CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "JPY", "INR", "BRL", "MXN"] as const;

export const DEFAULT_PACKAGES: RatePackage[] = [
  { id: "dedicated", name: "Dedicated video", detail: "A whole video built around your brand", platform: "youtube", price: null },
  { id: "integration", name: "Integration", detail: "60 to 90 seconds inside one of our videos", platform: "youtube", price: null },
  { id: "short", name: "Short or Reel", detail: "A vertical video of 30 to 60 seconds", platform: "any", price: null },
];

export function defaultKitSettings(): MediaKitSettings {
  return {
    v: 1,
    platforms: [],
    split: "together",
    period: "28d",
    from: null,
    to: null,
    sections: { cover: true, about: true, glance: true, platforms: true, audience: true, videos: true, partners: true, rates: true, contact: true },
    videos: 6,
    theme: "light",
    accent: "",
    cover: "videos",
    coverPath: null,
    title: "",
    tagline: "",
    about: "",
    audienceNote: "",
    rates: { show: false, currency: "USD", note: "", packages: DEFAULT_PACKAGES.map((p) => ({ ...p })) },
    partners: [],
    testimonials: [],
    contact: { name: "", email: "", phone: "", website: "", cta: "" },
    extra: [],
    manual: { glance: emptyTotals(), platforms: {}, audience: {} },
    videoPicks: { on: false, list: [] },
    coverPicks: { on: false, list: [] },
    coverGrid: "auto",
    fromTemplate: null,
  };
}

export function emptyTotals(): ManualTotals {
  return { on: false, followers: null, growth: null, views: null, viewsChange: null, engagementRate: null, avgViews: null, posted: null };
}
export function emptyManualPlatform(): ManualPlatform {
  return { on: false, handle: "", followers: null, growth: null, views: null, viewsChange: null, engagementRate: null, avgViews: null, avgViewsLong: null, avgViewsShort: null, posted: null, watchHours: null, chart: "auto", chartLabel: "", chartPoints: [] };
}
export function emptyManualAudience(): ManualAudience {
  return { on: false, women: null, men: null, other: null, ages: Object.fromEntries(KIT_AGES.map((a) => [a, null])) as Record<KitAge, null>, countries: [] };
}

// ---- Reading --------------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** Text without control characters, trimmed, at most `max` characters (whole characters, emoji included). */
export function cleanText(v: unknown, max: number, multiline = false): string {
  if (typeof v !== "string") return "";
  const noControls = multiline ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "") : v.replace(/[\u0000-\u001F\u007F]/g, " ");
  const tidy = (multiline ? noControls.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : noControls.replace(/ {2,}/g, " ")).trim();
  return Array.from(tidy).slice(0, max).join("").trim();
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (d: unknown): d is string => typeof d === "string" && ISO_DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const isPlatform = (v: unknown): v is KitPlatform => KIT_PLATFORMS.includes(v as KitPlatform);
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
let known: Set<string> | null = null;
/** A currency the browser knows (any well-formed code formats, so the list decides where there is one). */
export function isCurrency(v: unknown): v is string {
  if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) return false;
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (list?.length) {
      known ??= new Set(list);
      return known.has(v);
    }
    new Intl.NumberFormat("en-US", { style: "currency", currency: v }).format(1);
    return true;
  } catch {
    return false;
  }
}
/** A loose email check: something@something.something, no spaces. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
/** A website: a domain (with an optional path), with or without https://. */
export const isWebsite = (v: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v);
/** The link a website or an address opens (https:// added; nothing for anything else). */
export function websiteUrl(v: string): string | null {
  const s = v.trim();
  if (!s || !isWebsite(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
const ID = /^[a-z0-9]{1,12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A short id for a new package or quote. */
export const newId = () => Math.random().toString(36).slice(2, 10) || "x";

/** A cover photo path of this team's folder ("<team id>/<file>"); nothing else is kept. */
export function isCoverPath(v: unknown, teamId?: string | null): v is string {
  if (typeof v !== "string") return false;
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9._-]{1,80}$/.exec(v);
  return !!m && (!teamId || m[1] === teamId) && !v.includes("..");
}

/** A number from a form or a save: finite, within [min, max], rounded to `dp` decimals; null for anything else. */
export function num(v: unknown, min: number, max: number, dp = 0): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
}
const count = (v: unknown) => num(v, 0, LIMITS.count);
const pct = (v: unknown, min = 0, max = 100) => num(v, min, max, 1);
/** Our own thumbnail address only (the PDF fetches it): /api/analytics/thumb?… */
export const isOwnThumb = (v: unknown): v is string => typeof v === "string" && v.length <= 400 && /^\/api\/analytics\/thumb\?[\w=&%.-]+$/.test(v);
const isHttps = (v: unknown): v is string => typeof v === "string" && v.length <= 500 && /^https:\/\/[^\s"<>]+$/.test(v);

function readPicked(v: unknown): PickedVideo | null {
  if (!isObj(v) || !isPlatform(v.platform) || typeof v.id !== "string" || !/^[\w.:-]{1,120}$/.test(v.id)) return null;
  const kind = v.kind === "short" || v.kind === "long" || v.kind === "live" || v.kind === "post" ? v.kind : "long";
  return { platform: v.platform, id: v.id, kind, title: cleanText(v.title, LIMITS.pickTitle), thumb: isOwnThumb(v.thumb) ? v.thumb : null, url: isHttps(v.url) ? v.url : null, views: count(v.views), likes: count(v.likes), comments: count(v.comments) };
}
function readPicks(v: unknown, max: number): VideoPicks {
  if (!isObj(v)) return { on: false, list: [] };
  const seen = new Set<string>();
  const list: PickedVideo[] = [];
  for (const x of Array.isArray(v.list) ? v.list : []) {
    const p = readPicked(x);
    if (!p || seen.has(videoKey(p)) || list.length >= max) continue;
    seen.add(videoKey(p));
    list.push(p);
  }
  return { on: v.on === true, list };
}
function readManualPlatform(v: unknown): ManualPlatform | null {
  if (!isObj(v)) return null;
  const points = (Array.isArray(v.chartPoints) ? v.chartPoints : []).map(count).filter((x): x is number => x !== null).slice(0, LIMITS.chartPoints);
  return {
    on: v.on === true,
    handle: cleanText(v.handle, LIMITS.handle),
    followers: count(v.followers),
    growth: pct(v.growth, -100, 100000),
    views: count(v.views),
    viewsChange: pct(v.viewsChange, -100, 100000),
    engagementRate: pct(v.engagementRate),
    avgViews: count(v.avgViews),
    avgViewsLong: count(v.avgViewsLong),
    avgViewsShort: count(v.avgViewsShort),
    posted: num(v.posted, 0, 100000),
    watchHours: count(v.watchHours),
    chart: v.chart === "none" || v.chart === "own" ? v.chart : "auto",
    chartLabel: cleanText(v.chartLabel, LIMITS.chartLabel),
    chartPoints: points,
  };
}
function readManualAudience(v: unknown): ManualAudience | null {
  if (!isObj(v)) return null;
  const a = isObj(v.ages) ? v.ages : {};
  return {
    on: v.on === true,
    women: pct(v.women),
    men: pct(v.men),
    other: pct(v.other),
    ages: Object.fromEntries(KIT_AGES.map((k) => [k, pct(a[k])])) as Record<KitAge, number | null>,
    countries: (Array.isArray(v.countries) ? v.countries : [])
      .filter(isObj)
      .map((c) => ({ name: cleanText(c.name, LIMITS.country), share: pct(c.share) }))
      .filter((c) => c.name || c.share !== null)
      .slice(0, LIMITS.countries),
  };
}
function readTotals(v: unknown): ManualTotals {
  if (!isObj(v)) return emptyTotals();
  return { on: v.on === true, followers: count(v.followers), growth: pct(v.growth, -100, 100000), views: count(v.views), viewsChange: pct(v.viewsChange, -100, 100000), engagementRate: pct(v.engagementRate), avgViews: count(v.avgViews), posted: num(v.posted, 0, 100000) };
}
function readManual(v: unknown): KitManual {
  const m = isObj(v) ? v : {};
  const platforms: Partial<Record<KitPlatform, ManualPlatform>> = {};
  const audience: Partial<Record<KitPlatform, ManualAudience>> = {};
  for (const p of KIT_PLATFORMS) {
    const mp = isObj(m.platforms) ? readManualPlatform(m.platforms[p]) : null;
    if (mp) platforms[p] = mp;
    const ma = isObj(m.audience) ? readManualAudience(m.audience[p]) : null;
    if (ma) audience[p] = ma;
  }
  return { glance: readTotals(m.glance), platforms, audience };
}

export function readKitSettings(raw: unknown, teamId?: string | null): MediaKitSettings {
  const d = defaultKitSettings();
  if (!isObj(raw)) return d;
  const r = raw;

  const platforms = Array.isArray(r.platforms) ? [...new Set(r.platforms.filter(isPlatform))] : d.platforms;
  const period = KIT_PERIODS.some((p) => p.id === r.period) ? (r.period as KitPeriod) : d.period;
  let from = isDay(r.from) ? r.from : null;
  let to = isDay(r.to) ? r.to : null;
  if (from && to && from > to) [from, to] = [to, from];

  const sections = { ...d.sections };
  if (isObj(r.sections)) for (const k of KIT_SECTIONS) if (typeof r.sections[k] === "boolean") sections[k] = r.sections[k] as boolean;

  const rr = isObj(r.rates) ? r.rates : {};
  const seen = new Set<string>();
  const packages: RatePackage[] = Array.isArray(rr.packages)
    ? rr.packages
        .filter(isObj)
        .map((p, i) => {
          let id = typeof p.id === "string" && ID.test(p.id) ? p.id : `p${i + 1}`;
          while (seen.has(id)) id = `${id.slice(0, 10)}${i}`;
          seen.add(id);
          const price = typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0 ? Math.min(LIMITS.price, Math.round(p.price * 100) / 100) : null;
          return { id, name: cleanText(p.name, LIMITS.packageName), detail: cleanText(p.detail, LIMITS.packageDetail), platform: isPlatform(p.platform) ? p.platform : "any", price } as RatePackage;
        })
        .filter((p) => p.name || p.detail || p.price !== null)
        .slice(0, LIMITS.packages)
    : d.rates.packages;

  const tSeen = new Set<string>();
  const testimonials: Testimonial[] = Array.isArray(r.testimonials)
    ? r.testimonials
        .filter(isObj)
        .map((t, i) => {
          let id = typeof t.id === "string" && ID.test(t.id) ? t.id : `t${i + 1}`;
          while (tSeen.has(id)) id = `${id.slice(0, 10)}${i}`;
          tSeen.add(id);
          return { id, quote: cleanText(t.quote, LIMITS.quote, true), by: cleanText(t.by, LIMITS.by) };
        })
        .filter((t) => t.quote)
        .slice(0, LIMITS.testimonials)
    : d.testimonials;

  const partners: string[] = [];
  if (Array.isArray(r.partners)) {
    const seen = new Set<string>();
    for (const x of r.partners.map((v) => cleanText(v, LIMITS.partner))) {
      // Each once, whatever its case (the first spelling kept).
      if (!x || seen.has(x.toLowerCase()) || partners.length >= LIMITS.partners) continue;
      seen.add(x.toLowerCase());
      partners.push(x);
    }
  }

  const c = isObj(r.contact) ? r.contact : {};
  const email = cleanText(c.email, LIMITS.email);
  const website = cleanText(c.website, LIMITS.website);

  return {
    v: 1,
    platforms,
    split: r.split === "each" ? "each" : "together",
    period,
    from,
    to,
    sections,
    videos: r.videos === 3 ? 3 : 6,
    theme: r.theme === "dark" ? "dark" : "light",
    accent: isHex(r.accent) ? r.accent.toUpperCase() : "",
    cover: r.cover === "photo" || r.cover === "plain" ? r.cover : "videos",
    coverPath: isCoverPath(r.coverPath, teamId) ? r.coverPath : null,
    title: cleanText(r.title, LIMITS.title),
    tagline: cleanText(r.tagline, LIMITS.tagline),
    about: cleanText(r.about, LIMITS.about, true),
    audienceNote: cleanText(r.audienceNote, LIMITS.audienceNote, true),
    rates: {
      show: rr.show === true,
      currency: isCurrency(rr.currency) ? rr.currency : d.rates.currency,
      note: cleanText(rr.note, LIMITS.rateNote, true),
      packages,
    },
    partners,
    testimonials,
    contact: {
      name: cleanText(c.name, LIMITS.name),
      // A wrong email or website is kept as typed (the form says what's wrong); the kit leaves it out.
      email,
      phone: cleanText(c.phone, LIMITS.phone),
      website,
      cta: cleanText(c.cta, LIMITS.cta),
    },
    extra: Array.isArray(r.extra) ? [...new Set(r.extra.filter(isPlatform))] : [],
    manual: readManual(r.manual),
    videoPicks: readPicks(r.videoPicks, LIMITS.videoPicks),
    coverPicks: readPicks(r.coverPicks, LIMITS.coverPicks),
    coverGrid: r.coverGrid === "shorts" || r.coverGrid === "longs" || r.coverGrid === "mixed" ? r.coverGrid : "auto",
    fromTemplate: typeof r.fromTemplate === "string" && UUID.test(r.fromTemplate) ? r.fromTemplate.toLowerCase() : null,
  };
}

// ---- 1.40.0: templates ----------------------------------------------------------------------------------------------
// The owner: "i want to be able to set my things, then save it as a template. next time i can go into that template and
// just modify a few things and so on, and i can save as many templates as i want". A template is a named copy of a
// setup (media_kit_templates, migration 0118). Opening one puts it on screen (the setup saves as you go, as always) and
// notes which it was; the template itself changes only when it's updated.

export const TEMPLATE_NAME_MAX = 80;
/** More than anyone needs (each up to 100 KB); past it, one is deleted to save another. */
export const TEMPLATES_MAX = 200;
/** A template in the list: its name, and when and by whom it last changed (`by`: their name, null if they left). */
export type KitTemplateInfo = { id: string; name: string; updatedAt: string; byId: string | null; by: string | null };
/** A template's name as it's kept: one line, no spaces around it, at most 80 characters ("" if nothing's left). */
export const templateName = (v: unknown) => cleanText(v, TEMPLATE_NAME_MAX);
/** What a template keeps: the setup, checked, without the note of where it came from. */
export function templateSettings(raw: unknown, teamId?: string | null): MediaKitSettings {
  return { ...readKitSettings(raw, teamId), fromTemplate: null };
}
/** The same setup (whatever template each came from, and however it was typed: both read the same way). */
export function sameSetup(a: unknown, b: unknown, teamId?: string | null): boolean {
  return JSON.stringify(templateSettings(a, teamId)) === JSON.stringify(templateSettings(b, teamId));
}

/** The price as people read it: "$2,500", "€1,200.50", "RON 3,000". */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${price.toLocaleString("en-US")} ${currency}`;
  }
}
