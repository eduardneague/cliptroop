/**
 * Every video, to pick from (1.41.0): what the media kit's picker asks the server for, and the database filters that
 * answer it. The owner: "theres only 90 shorts here to pick from, you should be able to pick any short you ever had on
 * your channel or on any platform, so better filters needed here"; "long videos dont show up at all, same story".
 * Pure: the server action (media-kit-actions.ts browseKitVideos), the picker and tests/media-kit.test.ts share it.
 */
import { KIT_PLATFORMS, type KitPlatform } from "./settings";
import type { KitVideo } from "./numbers";

/** Tall (Shorts, Reels, TikToks), wide (long videos and live streams) or posts: as the kit draws them (isVertical). */
export const KIT_SHAPES = ["all", "tall", "wide", "post"] as const;
export type KitShape = (typeof KIT_SHAPES)[number];
export const KIT_SORTS = ["views", "newest", "oldest"] as const;
export type KitSort = (typeof KIT_SORTS)[number];

export type KitBrowse = {
  q: string;
  platform: KitPlatform | "all";
  shape: KitShape;
  sort: KitSort;
  /** A calendar year (UTC), or null for any time. */
  year: number | null;
  offset: number;
};

export type KitBrowseCounts = { platform: Record<KitPlatform | "all", number>; shape: Record<KitShape, number> };

export type KitBrowsed = {
  videos: KitVideo[];
  /** How many match, all pages together. */
  total: number;
  /** Where the next page starts (null: that was the last). */
  next: number | null;
  /** The first page only: how many each choice would show (the other choices as they are), the years with videos
   * (newest first) and the platforms the team's connected accounts have. */
  counts?: KitBrowseCounts;
  years?: number[];
  platforms?: KitPlatform[];
};

export const BROWSE_PAGE = 48;
/** The ClipTroop shorts and long videos a search may name (their ids go in the address). */
export const BROWSE_NAMED = 60;

/** Anything from the browser, made into a request the server can run: every field checked, the rest its default. */
export function readBrowse(raw: unknown): KitBrowse {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const year = typeof r.year === "number" && Number.isInteger(r.year) && r.year >= 2005 && r.year <= 2100 ? r.year : null;
  const offset = typeof r.offset === "number" && Number.isInteger(r.offset) && r.offset >= 0 ? Math.min(r.offset, 100_000) : 0;
  return {
    q: typeof r.q === "string" ? r.q.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 80) : "",
    platform: KIT_PLATFORMS.includes(r.platform as KitPlatform) ? (r.platform as KitPlatform) : "all",
    shape: KIT_SHAPES.includes(r.shape as KitShape) ? (r.shape as KitShape) : "all",
    sort: KIT_SORTS.includes(r.sort as KitSort) ? (r.sort as KitSort) : "views",
    year,
    offset,
  };
}

/**
 * Each shape as a PostgREST logic tree on analytics_content, the same split as isVertical (numbers.ts): tall = a Short,
 * anything on TikTok, or an Instagram video; wide = a long video or live stream elsewhere; posts = the rest. Together
 * they're every row, each once.
 */
export const SHAPE_TREE: Record<Exclude<KitShape, "all">, string> = {
  tall: "or(kind.eq.short,platform.eq.tiktok,and(platform.eq.instagram,kind.neq.post))",
  wide: "and(kind.in.(long,live),platform.not.in.(instagram,tiktok))",
  post: "and(kind.eq.post,platform.neq.tiktok)",
};

/** A LIKE pattern's own characters taken literally. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** A value inside a PostgREST logic tree, quoted (commas, dots and brackets in it are then just text). */
export const orValue = (s: string) => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * The search as a logic tree: every word in the platform's title, or the ClipTroop short or long video it belongs to
 * (named by its title or #number, found first). A #number: that short or long video, or a title with it as typed
 * ("#12", "iPhone 12"). Nothing to look for: a tree nothing matches.
 */
export function searchTree(o: { words: string[]; phrase: string; number: boolean; shorts: string[]; longs: string[] }): string {
  const terms = (o.number ? (o.phrase ? [o.phrase] : []) : o.words.length ? o.words : o.phrase ? [o.phrase] : []).map((w) => `title.ilike.${orValue(`%${likeEscape(w)}%`)}`);
  const parts = [
    terms.length ? (terms.length === 1 ? terms[0] : `and(${terms.join(",")})`) : null,
    o.shorts.length ? `short_id.in.(${o.shorts.join(",")})` : null,
    o.longs.length ? `project_id.in.(${o.longs.join(",")})` : null,
  ].filter((x): x is string => !!x);
  return parts.length ? `or(${parts.join(",")})` : "or(external_id.eq.__none__)";
}

/** Trees that must all hold, as one `or=` the client can send (a single child: itself; several: an and of them). */
export function allOf(trees: (string | null)[]): string | null {
  const t = trees.filter((x): x is string => !!x);
  if (!t.length) return null;
  // `.or()` wraps its argument in brackets: an or(...) tree goes in as its children; anything else as the only child.
  if (t.length === 1) return t[0].startsWith("or(") ? t[0].slice(3, -1) : t[0];
  return `and(${t.join(",")})`;
}

/** Years from the oldest video's to this one, newest first (any time: the list, for the filter). */
export function yearsSince(oldest: string | null, now = new Date()): number[] {
  const thisYear = now.getUTCFullYear();
  const from = oldest && /^\d{4}/.test(oldest) ? Math.max(2005, Math.min(thisYear, Number(oldest.slice(0, 4)))) : thisYear;
  return Array.from({ length: thisYear - from + 1 }, (_, i) => thisYear - i);
}

/** The picked videos to read again: well-formed, the four platforms, each once, at most the cover's and the page's 21. */
export function pickedKeys(list: unknown): { platform: KitPlatform; id: string }[] {
  const out: { platform: KitPlatform; id: string }[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(list) ? list : []) {
    const v = x as { platform?: unknown; id?: unknown } | null;
    if (!v || !KIT_PLATFORMS.includes(v.platform as KitPlatform) || typeof v.id !== "string" || !/^[\w.:-]{1,120}$/.test(v.id)) continue;
    const k = `${v.platform}:${v.id}`;
    if (seen.has(k) || out.length >= 21) continue;
    seen.add(k);
    out.push({ platform: v.platform as KitPlatform, id: v.id });
  }
  return out;
}

