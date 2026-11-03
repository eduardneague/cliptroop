/**
 * The media kit's own numbers (1.39.0): what's typed in (Manual) laid over what was read (Auto), so every page draws
 * from one set of numbers. Auto is the default for every part; a part switched to Manual shows exactly its fields (an
 * empty field is left off the page). A platform with no connection can be added by hand (all its numbers typed in).
 * Picked videos are drawn with the freshest numbers the kit has for them. Pure: tests/media-kit.test.ts.
 */
import { changePct, growthPct, profileUrl, ratePct, sum, type KitAudience, type KitPlatformNumbers, type KitVideo, type MediaKitNumbers } from "./numbers";
import { KIT_AGES, KIT_PLATFORMS, KIT_PLATFORM_NAME, videoKey, type KitPlatform, type ManualAudience, type ManualPlatform, type ManualTotals, type MediaKitSettings, type PickedVideo } from "./settings";

/** A platform with nothing read (added by hand). */
export function blankPlatform(platform: KitPlatform): KitPlatformNumbers {
  return { platform, handle: null, url: null, followers: null, followersNet: null, views: null, viewsPrev: null, engagement: null, watchHours: null, posted: 0, counted: 0, avgViews: null, avgViewsLong: null, avgViewsShort: null, daily: [], top: [], audience: null };
}

/** A platform's numbers as typed in. The period's growth and change become the counts the pages work from. */
export function withManual(p: KitPlatformNumbers, m: ManualPlatform): KitPlatformNumbers {
  const handle = m.handle ? (m.handle.startsWith("@") || /\s/.test(m.handle) ? m.handle : `@${m.handle}`) : p.handle;
  const followers = m.followers;
  const views = m.views;
  const yt = p.platform === "youtube";
  const net = followers !== null && m.growth !== null && m.growth > -100 ? followers - followers / (1 + m.growth / 100) : null;
  const prev = views !== null && m.viewsChange !== null && m.viewsChange > -100 ? views / (1 + m.viewsChange / 100) : null;
  const chart = m.chart === "own" && m.chartPoints.length >= 2 ? { label: m.chartLabel || "Views", points: m.chartPoints } : null;
  return {
    ...p,
    handle,
    url: handle === p.handle ? p.url : profileUrl(p.platform, handle),
    followers,
    followersNet: net,
    views,
    viewsPrev: prev,
    engagement: views !== null && m.engagementRate !== null ? (m.engagementRate / 100) * views : null,
    engagementRate: m.engagementRate,
    watchHours: yt ? m.watchHours : null,
    posted: m.posted ?? 0,
    counted: m.posted ?? 0,
    avgViews: m.avgViews,
    avgViewsLong: yt ? m.avgViewsLong : null,
    avgViewsShort: yt ? m.avgViewsShort : null,
    daily: m.chart === "auto" ? p.daily : [],
    chart,
    manual: true,
  };
}

/** Who watches, as typed in: each share as it was typed (the page says what you typed, even when they don't quite add
 * up to 100; the bars are drawn out of their own total); women and men biggest first, ages youngest first, countries
 * biggest first and the rest as other countries. */
export function audienceFrom(platform: KitPlatform, m: ManualAudience): KitAudience | null {
  const typed = (rows: { label: string; value: number | null }[]) => rows.filter((r) => (r.value ?? 0) > 0).map((r) => ({ label: r.label, share: r.value! }));
  const genders = typed([
    { label: "Women", value: m.women },
    { label: "Men", value: m.men },
    { label: "Other", value: m.other },
  ]).sort((a, b) => b.share - a.share);
  const ages = typed(KIT_AGES.map((a) => ({ label: a, value: m.ages[a] })));
  const named = m.countries.filter((c) => c.name && (c.share ?? 0) > 0).map((c) => ({ code: "own", label: c.name, share: c.share! }));
  named.sort((a, b) => b.share - a.share);
  const rest = 100 - named.reduce((t, c) => t + c.share, 0);
  const countries = named.length && rest >= 0.5 ? [...named, { code: "", label: "Other countries", share: rest }] : named;
  if (!genders.length && !ages.length && !countries.length) return null;
  return { who: `${KIT_PLATFORM_NAME[platform]} audience`, genders, ages, countries };
}

/**
 * The numbers every page draws from: the platforms read (Auto), each one's typed-in numbers when it's on Manual, the
 * platforms added by hand, and typed-in audiences. In KIT_PLATFORMS' order.
 */
export function applyManual(nums: MediaKitNumbers, s: MediaKitSettings): MediaKitNumbers {
  const platforms: KitPlatformNumbers[] = [];
  for (const platform of KIT_PLATFORMS) {
    const read = nums.platforms.find((p) => p.platform === platform) ?? null;
    const byHand = !read && s.extra.includes(platform);
    if (!read && !byHand) continue;
    const mp = s.manual.platforms[platform];
    let p = read ?? blankPlatform(platform);
    if (mp && (mp.on || byHand)) p = withManual(p, mp);
    else if (byHand) p = { ...p, manual: true };
    const ma = s.manual.audience[platform];
    if (ma?.on) p = { ...p, audience: audienceFrom(platform, ma), manualAudience: true };
    platforms.push(p);
  }
  return { ...nums, platforms };
}

export type Totals = {
  followers: number | null;
  followersGrowth: number | null;
  views: number | null;
  viewsChange: number | null;
  engagementRate: number | null;
  avgViews: number | null;
  posted: number;
  /** Typed in (At a glance on Manual). */
  manual: boolean;
};

/** The platforms added up (Auto), or At a glance's typed-in numbers (Manual: exactly those). */
export function kitTotals(ps: KitPlatformNumbers[], glance?: ManualTotals | null): Totals {
  if (glance?.on)
    return {
      followers: glance.followers,
      followersGrowth: glance.growth,
      views: glance.views,
      viewsChange: glance.viewsChange,
      engagementRate: glance.engagementRate,
      avgViews: glance.avgViews,
      posted: glance.posted ?? 0,
      manual: true,
    };
  const followers = sum(ps.map((p) => p.followers));
  const net = sum(ps.filter((p) => p.followers !== null).map((p) => p.followersNet));
  const views = sum(ps.map((p) => p.views));
  const prev = sum(ps.filter((p) => p.views !== null).map((p) => p.viewsPrev));
  const engaged = ps.filter((p) => p.engagement !== null && p.views !== null);
  const counted = ps.reduce((t, p) => t + (p.avgViews !== null ? p.counted : 0), 0);
  // One platform with only a typed-in rate (no views): its rate stands for the kit.
  const onlyRate = ps.length === 1 && ps[0].engagementRate != null && ps[0].views === null ? ps[0].engagementRate : null;
  return {
    followers,
    followersGrowth: growthPct(followers, net),
    views,
    viewsChange: changePct(views, prev),
    engagementRate: onlyRate ?? ratePct(sum(engaged.map((p) => p.engagement)), sum(engaged.map((p) => p.views))),
    avgViews: counted ? ps.reduce((t, p) => t + (p.avgViews ?? 0) * (p.avgViews !== null ? p.counted : 0), 0) / counted : null,
    posted: ps.reduce((t, p) => t + p.posted, 0),
    manual: false,
  };
}

/** A picked video as the kit draws it: the freshest numbers it has for it (the pool), else as it was when picked. */
export function pickedVideo(v: PickedVideo, pool: KitVideo[]): KitVideo {
  const fresh = pool.find((x) => videoKey(x) === videoKey(v));
  return fresh ?? { platform: v.platform, id: v.id, kind: v.kind, title: v.title || null, url: v.url, thumb: v.thumb, views: v.views, likes: v.likes, comments: v.comments, publishedAt: null };
}

/** What a picked video keeps of a video (to draw it even when the pool no longer has it). */
export function toPicked(v: KitVideo): PickedVideo {
  return { platform: v.platform, id: v.id, kind: v.kind, title: (v.title ?? "").slice(0, 200), thumb: v.thumb, url: v.url && /^https:\/\//.test(v.url) ? v.url : null, views: v.views, likes: v.likes, comments: v.comments };
}

/** The pages' numbers, for pre-filling Manual's fields from what was read. */
export function manualFromRead(p: KitPlatformNumbers): Omit<ManualPlatform, "on" | "chart" | "chartLabel" | "chartPoints"> {
  const r = (v: number | null, dp = 0) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
  return {
    handle: p.handle ?? "",
    followers: r(p.followers),
    growth: r(growthPct(p.followers, p.followersNet), 1),
    views: r(p.views),
    viewsChange: r(changePct(p.views, p.viewsPrev), 1),
    engagementRate: r(p.engagementRate ?? ratePct(p.engagement, p.views), 1),
    avgViews: r(p.avgViews),
    avgViewsLong: r(p.avgViewsLong),
    avgViewsShort: r(p.avgViewsShort),
    posted: p.posted || null,
    watchHours: r(p.watchHours),
  };
}

/** Who watches, from what was read, for pre-filling. */
export function audienceFromRead(a: KitAudience | null): Omit<ManualAudience, "on"> {
  const r = (v: number | undefined) => (v === undefined ? null : Math.round(v * 10) / 10);
  const g = (label: string) => r(a?.genders.find((x) => x.label === label)?.share);
  return {
    women: g("Women"),
    men: g("Men"),
    other: g("Other") ?? g("Not said"),
    ages: Object.fromEntries(KIT_AGES.map((k) => [k, r(a?.ages.find((x) => x.label === k)?.share)])) as ManualAudience["ages"],
    countries: (a?.countries ?? []).filter((c) => c.code).slice(0, 5).map((c) => ({ name: c.label, share: r(c.share) })),
  };
}

/** The totals, for pre-filling At a glance. */
export function totalsFromRead(t: Totals): Omit<ManualTotals, "on"> {
  const r = (v: number | null, dp = 0) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
  return { followers: r(t.followers), growth: r(t.followersGrowth, 1), views: r(t.views), viewsChange: r(t.viewsChange, 1), engagementRate: r(t.engagementRate, 1), avgViews: r(t.avgViews), posted: t.posted || null };
}

/** A number as it's typed: "2.5M" → 2500000, "120k" → 120000, "1,200" → 1200, "12%" → 12, "+3.5" → 3.5; null for
 * nothing, or anything that isn't a number. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/[\s,_%]/g, "").replace(/^\+/, "");
  if (!t) return null;
  const m = /^(-?\d*\.?\d+)([kmb])?$/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as "k" | "m" | "b"] : 1);
  return Number.isFinite(n) ? n : null;
}

/** A chart's points as they're typed: "120K, 180K, 1.1M" (spaces, semicolons, and commas that aren't a number's own:
 * 1,200 stays one point). Not numbers and below zero: left out. */
export function parsePoints(raw: string): number[] {
  return raw
    .split(/[\s;]+|,(?!\d{3}(?![\dkmb]))/i)
    .map(parseAmount)
    .filter((x): x is number => x !== null && x >= 0);
}

/** A chart's points shown back as they'd be typed: 880K, 1.02M, 1234567 (a short form only where it's exact, so they
 * read back as the same numbers). */
export function pointsText(points: number[]): string {
  const one = (n: number) => {
    const exact = (q: number) => Math.abs(q * 100 - Math.round(q * 100)) < 1e-6;
    if (Math.abs(n) >= 1e9 && exact(n / 1e9)) return `${Number((n / 1e9).toFixed(2))}B`;
    if (Math.abs(n) >= 1e6 && exact(n / 1e6)) return `${Number((n / 1e6).toFixed(2))}M`;
    if (Math.abs(n) >= 1e3 && Math.abs(n) < 1e6 && exact(n / 1e3)) return `${Number((n / 1e3).toFixed(2))}K`;
    return String(n);
  };
  return points.map(one).join(", ");
}
