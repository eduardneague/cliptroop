/**
 * The numbers a media kit shows (1.37.0), and the small sums behind them. Pure: the server gathers the raw numbers
 * (gather.ts) and shapes them here; the slides (layout.ts) add up the platforms the kit is for. Tested in
 * tests/media-kit.test.ts.
 */
import type { KitPlatform } from "./settings";

export type KitVideo = {
  platform: KitPlatform;
  id: string;
  kind: "short" | "long" | "live" | "post";
  title: string | null;
  /** Where it plays (the link in the PDF). */
  url: string | null;
  /** Its thumbnail through ClipTroop's own address (the PDF can't read the platforms' pictures itself). */
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
};

export type KitShare = { label: string; share: number };
export type KitAudience = {
  /** Whose numbers: "YouTube viewers", "Instagram followers". */
  who: string;
  ages: KitShare[];
  genders: KitShare[];
  countries: (KitShare & { code: string })[];
};

export type KitPlatformNumbers = {
  platform: KitPlatform;
  /** "@handle", or the account's name. */
  handle: string | null;
  /** The profile's address, when it can be made from the handle. */
  url: string | null;
  followers: number | null;
  /** Followers gained (minus lost) in the period. */
  followersNet: number | null;
  views: number | null;
  viewsPrev: number | null;
  /** Likes, comments and shares (Facebook: engagements; TikTok: likes). */
  engagement: number | null;
  watchHours: number | null;
  /** Videos posted in the period (with numbers or not), and how many of them have numbers. */
  posted: number;
  counted: number;
  /** Average views of the videos posted in the period: all, and (YouTube) long videos and Shorts on their own. */
  avgViews: number | null;
  avgViewsLong: number | null;
  avgViewsShort: number | null;
  /** Views on each day of the period. */
  daily: (number | null)[];
  /** The most viewed videos posted in the period, most viewed first (up to 6). */
  top: KitVideo[];
  audience: KitAudience | null;
  /** 1.39.0 (manual.ts): numbers typed in for this platform (the kit says which numbers are its own). */
  manual?: boolean;
  /** Its audience typed in. */
  manualAudience?: boolean;
  /** A typed-in engagement rate (%), when there are no views to work it out from. */
  engagementRate?: number | null;
  /** A chart of your own (Manual): its points and what they are, drawn instead of the views per day. */
  chart?: { label: string; points: number[] } | null;
};

export type MediaKitNumbers = {
  team: { name: string; color: string; logoUrl: string | null };
  window: { from: string; to: string; days: number };
  generatedAt: string;
  /** Every connected platform with numbers, in KIT_PLATFORMS' order. */
  platforms: KitPlatformNumbers[];
  /** The most viewed videos ever (for the cover's wall when the period has few). */
  allTime: KitVideo[];
  /** 1.39.0: the videos to pick from (the period's and the most viewed ever, each once, most viewed first). */
  pool?: KitVideo[];
};

// ---- Sums -----------------------------------------------------------------------------------------------------------

export const sum = (xs: (number | null | undefined)[]): number | null => {
  let s = 0;
  let any = false;
  for (const x of xs) {
    if (x === null || x === undefined || !Number.isFinite(x)) continue;
    s += x;
    any = true;
  }
  return any ? s : null;
};

export const mean = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** How much bigger (in %) than before; null when there's no "before" to compare with. */
export function changePct(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before <= 0) return null;
  return ((now - before) / before) * 100;
}

/** Follower growth over the period in %: what was gained over what there was at its start. */
export function growthPct(followers: number | null, net: number | null): number | null {
  if (followers === null || net === null) return null;
  return changePct(followers, followers - net);
}

/** A part of a whole in % (engagement rate: engagement over views). */
export function ratePct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return (part / whole) * 100;
}

/** Day by day, the platforms added up (null on a day none of them has a number). */
export function addDaily(series: (number | null)[][]): (number | null)[] {
  const len = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length: len }, (_, i) => sum(series.map((s) => s[i] ?? null)));
}

/** Tall pictures: Shorts, TikToks, Reels (an Instagram post is square, a long video wide). */
export const isVertical = (v: Pick<KitVideo, "platform" | "kind">) => v.kind === "short" || v.platform === "tiktok" || (v.platform === "instagram" && v.kind !== "post");

// ---- Audience -------------------------------------------------------------------------------------------------------

type Row = { key: string; value: number | null };
const GENDER: Record<string, string> = { female: "Women", male: "Men", user_specified: "Other", F: "Women", M: "Men", U: "Not said" };

/** "age25-34" → "25–34", "age65-" → "65+". */
export function ageLabel(k: string) {
  const m = k.replace(/^age/i, "").match(/^(\d+)-(\d*)$/);
  if (!m) return k;
  return m[2] ? `${m[1]}–${m[2]}` : `${m[1]}+`;
}
const ageStart = (k: string) => parseInt(k.replace(/^age/i, "").match(/\d+/)?.[0] ?? "999", 10);

/** Shares (in %, adding up to 100) of the rows' values, biggest first unless `keepOrder`. */
export function shares(rows: { label: string; value: number }[], keepOrder = false): KitShare[] {
  const total = rows.reduce((t, r) => t + Math.max(0, r.value), 0);
  if (total <= 0) return [];
  const out = rows.filter((r) => r.value > 0).map((r) => ({ label: r.label, share: (r.value / total) * 100 }));
  return keepOrder ? out : out.sort((a, b) => b.share - a.share);
}

/** Ages, youngest first, from YouTube's age-and-gender split or the followers' ages. */
export function agesFrom(rows: Row[], combined: boolean): KitShare[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) continue;
    const age = combined ? r.key.split("|")[0] : r.key;
    by.set(age, (by.get(age) ?? 0) + r.value);
  }
  const list = [...by.entries()].sort((a, b) => ageStart(a[0]) - ageStart(b[0])).map(([k, v]) => ({ label: ageLabel(k), value: v }));
  return shares(list, true);
}

/** Women, men and the rest, from YouTube's age-and-gender split or the followers' genders. */
export function gendersFrom(rows: Row[], combined: boolean): KitShare[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) continue;
    const g = GENDER[combined ? r.key.split("|")[1] ?? "" : r.key] ?? "Other";
    by.set(g, (by.get(g) ?? 0) + r.value);
  }
  return shares([...by.entries()].map(([label, value]) => ({ label, value })));
}

/** The top countries (5) and the rest as "Other". */
export function countriesFrom(rows: { code: string; value: number }[], nameOf: (code: string) => string, top = 5): (KitShare & { code: string })[] {
  const all = shares(rows.map((r) => ({ label: r.code, value: r.value })));
  const head = all.slice(0, top).map((s) => ({ code: s.label, label: nameOf(s.label), share: s.share }));
  const rest = all.slice(top).reduce((t, s) => t + s.share, 0);
  return rest >= 0.5 ? [...head, { code: "", label: "Other countries", share: rest }] : head;
}

/** A country's name in English ("RO" → "Romania"). */
let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return /^[A-Z]{2}$/.test(code) ? regionNames.of(code) ?? code : code;
  } catch {
    return code;
  }
}

/** The profile's address from its handle (Facebook only with a username). */
export function profileUrl(platform: KitPlatform, handle: string | null): string | null {
  if (!handle || !handle.startsWith("@")) return null;
  const name = handle.slice(1);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return null;
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/@${name}`;
    case "instagram":
      return `https://www.instagram.com/${name}`;
    case "tiktok":
      return `https://www.tiktok.com/@${name}`;
    case "facebook":
      return `https://www.facebook.com/${name}`;
  }
}
